-- =============================================================================
-- GRS Database Migration 05: household_unassignments table
-- Tracks unassignments of households from teams for sync change feeds
-- Authoritative definition per Build Plan §8.3, §8.4 & Milestone 4
-- =============================================================================

-- 1. Create household_unassignments table
CREATE TABLE IF NOT EXISTS "household_unassignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "unassigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_by" UUID NOT NULL,

    CONSTRAINT "household_unassignments_pkey" PRIMARY KEY ("id")
);

-- 2. Index for efficient delta sync queries by team and unassignment timestamp
CREATE INDEX IF NOT EXISTS "household_unassignments_team_id_unassigned_at_idx" 
    ON "household_unassignments"("team_id", "unassigned_at");

-- 3. Foreign key constraints matching schema relationships
ALTER TABLE "household_unassignments" 
    DROP CONSTRAINT IF EXISTS "household_unassignments_household_id_fkey",
    ADD CONSTRAINT "household_unassignments_household_id_fkey" 
    FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "household_unassignments" 
    DROP CONSTRAINT IF EXISTS "household_unassignments_team_id_fkey",
    ADD CONSTRAINT "household_unassignments_team_id_fkey" 
    FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "household_unassignments" 
    DROP CONSTRAINT IF EXISTS "household_unassignments_unassigned_by_fkey",
    ADD CONSTRAINT "household_unassignments_unassigned_by_fkey" 
    FOREIGN KEY ("unassigned_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Enable Row Level Security (RLS) with NO policies
-- Per plan requirements: default deny for anon/authenticated, bypassed by service role & postgres
ALTER TABLE "household_unassignments" ENABLE ROW LEVEL SECURITY;
