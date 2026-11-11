-- =============================================================================
-- GRS Database Migration 11: Duplicate Detection Indexes, FKs & Stats Exclusion
-- Aligns schema with Agent Build Plan Section 5.3, Section 9, and M6.2/M6.4/M6.5
-- =============================================================================

-- 1. Ensure trigram extension is available for fuzzy name lookup
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. Missing pg_trgm GIN index on clients.name_norm per Section 5.3
CREATE INDEX IF NOT EXISTS "clients_name_norm_trgm_idx"
  ON "clients" USING gin ("name_norm" gin_trgm_ops);

-- 3. Composite GIN index on (gn_id, name_norm) via btree_gin when available
--    Allows single-index GN-scoped fuzzy candidate lookup at 5M+ rows.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "btree_gin";
  EXECUTE 'CREATE INDEX IF NOT EXISTS "clients_gn_name_norm_trgm_idx" ON "clients" USING gin ("gn_id", "name_norm" gin_trgm_ops)';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Skipping btree_gin composite index (%): falling back to BitmapAnd/gn_id index', SQLERRM;
END $$;

-- 4. Partial indexes on clients for duplicate exclusion and live phone/household lookups
CREATE INDEX IF NOT EXISTS "clients_duplicate_of_idx"
  ON "clients"("duplicate_of")
  WHERE "duplicate_of" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "clients_gn_id_live_idx"
  ON "clients"("gn_id")
  WHERE "deleted_at" IS NULL AND "duplicate_of" IS NULL;

-- 5. Indexes and Foreign Keys on duplicate_candidates for keyset queue pagination & cascade integrity
CREATE INDEX IF NOT EXISTS "duplicate_candidates_status_score_created_idx"
  ON "duplicate_candidates"("status", "score" DESC, "created_at" DESC, "id" ASC);

CREATE INDEX IF NOT EXISTS "duplicate_candidates_client_b_idx"
  ON "duplicate_candidates"("client_b");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'duplicate_candidates_client_a_fkey') THEN
    ALTER TABLE "duplicate_candidates"
      ADD CONSTRAINT "duplicate_candidates_client_a_fkey"
      FOREIGN KEY ("client_a") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'duplicate_candidates_client_b_fkey') THEN
    ALTER TABLE "duplicate_candidates"
      ADD CONSTRAINT "duplicate_candidates_client_b_fkey"
      FOREIGN KEY ("client_b") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'duplicate_candidates_reviewed_by_fkey') THEN
    ALTER TABLE "duplicate_candidates"
      ADD CONSTRAINT "duplicate_candidates_reviewed_by_fkey"
      FOREIGN KEY ("reviewed_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 6. Tighten RLS read policy on duplicate_candidates: L5 (team_member) has zero access;
--    L4/L3/L2/L1/L0/L00 can inspect pairs where either client_a or client_b is in scope.
DROP POLICY IF EXISTS "Duplicate candidates read in scope" ON duplicate_candidates;
CREATE POLICY "Duplicate candidates read in scope" ON duplicate_candidates FOR SELECT TO authenticated
USING (
  app.current_user_role() <> 'team_member'
  AND EXISTS (
    SELECT 1 FROM clients c
    WHERE (c.id = client_a OR c.id = client_b)
      AND app.can_see(c.district_id, c.ds_id, c.gn_id, c.team_id, c.collected_by)
  )
);

-- 7. Update stats rollup stored procedure so confirmed duplicates (duplicate_of IS NOT NULL)
--    are excluded from all beneficiary & client counts without deleting records (M6.4 / §9).
DROP FUNCTION IF EXISTS public.refresh_dirty_team_stats();
CREATE OR REPLACE FUNCTION public.refresh_dirty_team_stats()
RETURNS integer AS $$
DECLARE
  refreshed_count integer;
BEGIN
  WITH dirty_teams_snapshot AS (
    SELECT id, stats_dirty_at, gn_id
    FROM "teams"
    WHERE stats_dirty_at IS NOT NULL
  ),
  aggregated_stats AS (
    SELECT
      dt.id AS team_id,
      dt.gn_id,
      gn.ds_id,
      ds.district_id,
      COALESCE(COUNT(DISTINCT h.id), 0) AS houses_assigned,
      COALESCE(COUNT(DISTINCT CASE
        WHEN c.id IS NOT NULL
          OR h.visit_status IN ('in_progress', 'completed')
          OR h.finished_at IS NOT NULL
        THEN h.id
      END), 0) AS houses_started,
      COALESCE(COUNT(DISTINCT CASE
        WHEN h.visit_status = 'completed'
          OR h.finished_at IS NOT NULL
        THEN h.id
      END), 0) AS houses_done,
      COALESCE(COUNT(DISTINCT c.id), 0) AS clients_count,
      COALESCE(COUNT(DISTINCT CASE WHEN c.is_epf = true THEN c.id END), 0) AS epf_count,
      COALESCE(COUNT(DISTINCT CASE WHEN c.is_etf = true THEN c.id END), 0) AS etf_count,
      COALESCE(COUNT(DISTINCT CASE WHEN c.is_aswesuma = true THEN c.id END), 0) AS aswesuma_count,
      COALESCE(COUNT(DISTINCT CASE WHEN c.is_samurdhi = true THEN c.id END), 0) AS samurdhi_count,
      COALESCE(COUNT(DISTINCT CASE WHEN c.has_special_needs = true THEN c.id END), 0) AS special_needs_count
    FROM dirty_teams_snapshot dt
    JOIN "gn_divisions" gn ON gn.id = dt.gn_id
    JOIN "divisional_secretariats" ds ON ds.id = gn.ds_id
    LEFT JOIN "households" h ON h.team_id = dt.id AND h.deleted_at IS NULL
    LEFT JOIN "clients" c ON c.household_id = h.id AND c.deleted_at IS NULL AND c.duplicate_of IS NULL
    GROUP BY dt.id, dt.gn_id, gn.ds_id, ds.district_id
  ),
  upserted_team_stats AS (
    INSERT INTO "team_stats" (
      "team_id",
      "gn_id",
      "ds_id",
      "district_id",
      "houses_assigned",
      "houses_started",
      "houses_done",
      "clients_count",
      "epf_count",
      "etf_count",
      "aswesuma_count",
      "samurdhi_count",
      "special_needs_count",
      "refreshed_at"
    )
    SELECT
      team_id,
      gn_id,
      ds_id,
      district_id,
      houses_assigned,
      houses_started,
      houses_done,
      clients_count,
      epf_count,
      etf_count,
      aswesuma_count,
      samurdhi_count,
      special_needs_count,
      CURRENT_TIMESTAMP
    FROM aggregated_stats
    ON CONFLICT ("team_id") DO UPDATE SET
      "houses_assigned" = EXCLUDED."houses_assigned",
      "houses_started" = EXCLUDED."houses_started",
      "houses_done" = EXCLUDED."houses_done",
      "clients_count" = EXCLUDED."clients_count",
      "epf_count" = EXCLUDED."epf_count",
      "etf_count" = EXCLUDED."etf_count",
      "aswesuma_count" = EXCLUDED."aswesuma_count",
      "samurdhi_count" = EXCLUDED."samurdhi_count",
      "special_needs_count" = EXCLUDED."special_needs_count",
      "refreshed_at" = EXCLUDED."refreshed_at"
  ),
  cleared_teams AS (
    UPDATE "teams" t
    SET "stats_dirty_at" = NULL
    FROM dirty_teams_snapshot dt
    WHERE t.id = dt.id
      AND t.stats_dirty_at = dt.stats_dirty_at
    RETURNING t.id
  )
  SELECT COUNT(*) INTO refreshed_count FROM cleared_teams;

  RETURN refreshed_count;
END;
$$ LANGUAGE plpgsql;

