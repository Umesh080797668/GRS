-- Migration 04: pg_cron and Automated Refresh Job (M1.14 / Section 8.5)
-- Ensures pg_cron is enabled and registers scheduled stats refresh

CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- Ensure households columns exist
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "visit_status" VARCHAR(50) DEFAULT 'not_started';
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "finished_at" TIMESTAMPTZ(6);
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "finished_by" UUID;

-- Stored procedure to refresh dirty team stats matching TeamStat model
CREATE OR REPLACE FUNCTION public.refresh_dirty_team_stats()
RETURNS integer AS $$
DECLARE
  refreshed_count integer;
BEGIN
  -- Snapshot dirty teams and their dirty timestamps in a CTE
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
    LEFT JOIN "clients" c ON c.household_id = h.id AND c.deleted_at IS NULL
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

-- Schedule pg_cron 5-minute recurring refresh job
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('grs_stats_refresh_job');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    PERFORM cron.schedule('grs_stats_refresh_job', '*/5 * * * *', 'SELECT public.refresh_dirty_team_stats();');
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Gracefully ignore if running in restricted environments
  NULL;
END;
$$;
