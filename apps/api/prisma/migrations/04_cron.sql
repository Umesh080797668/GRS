-- Migration 04: pg_cron and Automated Refresh Job (M1.14 / Section 8.5)
-- Ensures pg_cron is enabled and registers scheduled stats refresh

CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- Stored procedure to refresh dirty team stats matching TeamStat model
CREATE OR REPLACE FUNCTION public.refresh_dirty_team_stats()
RETURNS void AS $$
BEGIN
  -- Roll up dirty teams into team_stats
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
    t.id,
    t.gn_id,
    gn.ds_id,
    ds.district_id,
    COALESCE(COUNT(DISTINCT h.id), 0),
    COALESCE(COUNT(DISTINCT CASE WHEN c.id IS NOT NULL THEN h.id END), 0),
    0,
    COALESCE(COUNT(DISTINCT c.id), 0),
    COALESCE(COUNT(DISTINCT CASE WHEN c.is_epf = true THEN c.id END), 0),
    COALESCE(COUNT(DISTINCT CASE WHEN c.is_etf = true THEN c.id END), 0),
    COALESCE(COUNT(DISTINCT CASE WHEN c.is_aswesuma = true THEN c.id END), 0),
    COALESCE(COUNT(DISTINCT CASE WHEN c.is_samurdhi = true THEN c.id END), 0),
    COALESCE(COUNT(DISTINCT CASE WHEN c.has_special_needs = true THEN c.id END), 0),
    CURRENT_TIMESTAMP
  FROM "teams" t
  JOIN "gn_divisions" gn ON gn.id = t.gn_id
  JOIN "divisional_secretariats" ds ON ds.id = gn.ds_id
  LEFT JOIN "households" h ON h.team_id = t.id AND h.deleted_at IS NULL
  LEFT JOIN "clients" c ON c.household_id = h.id AND c.deleted_at IS NULL
  WHERE t.stats_dirty_at IS NOT NULL
  GROUP BY t.id, t.gn_id, gn.ds_id, ds.district_id
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
    "refreshed_at" = EXCLUDED."refreshed_at";

  -- Reset stats_dirty_at on refreshed teams
  UPDATE "teams" SET "stats_dirty_at" = NULL WHERE "stats_dirty_at" IS NOT NULL;
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
