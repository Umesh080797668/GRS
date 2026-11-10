-- =============================================================================
-- GRS Database Migration 06: profile_assignments table & refresh token active GN
-- Multi-GN Assignment Architecture for Level 4 CDC Secretaries
-- =============================================================================

-- 1. Create profile_assignments table
CREATE TABLE IF NOT EXISTS "profile_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL,
    "gn_id" UUID NOT NULL,
    "team_id" UUID,
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_assignments_pkey" PRIMARY KEY ("id")
);

-- 2. Indices
CREATE INDEX IF NOT EXISTS "profile_assignments_profile_id_idx" 
    ON "profile_assignments"("profile_id");

CREATE INDEX IF NOT EXISTS "profile_assignments_gn_id_idx" 
    ON "profile_assignments"("gn_id");

-- Partial unique index: Exactly one active CDC Secretary per GN division
CREATE UNIQUE INDEX IF NOT EXISTS "profile_assignments_gn_id_active_unique" 
    ON "profile_assignments"("gn_id") 
    WHERE "valid_to" IS NULL;

-- 3. Foreign key constraints
ALTER TABLE "profile_assignments" 
    DROP CONSTRAINT IF EXISTS "profile_assignments_profile_id_fkey",
    ADD CONSTRAINT "profile_assignments_profile_id_fkey" 
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "profile_assignments" 
    DROP CONSTRAINT IF EXISTS "profile_assignments_gn_id_fkey",
    ADD CONSTRAINT "profile_assignments_gn_id_fkey" 
    FOREIGN KEY ("gn_id") REFERENCES "gn_divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "profile_assignments" 
    DROP CONSTRAINT IF EXISTS "profile_assignments_team_id_fkey",
    ADD CONSTRAINT "profile_assignments_team_id_fkey" 
    FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Enable RLS
ALTER TABLE "profile_assignments" ENABLE ROW LEVEL SECURITY;

-- 5. Add active assignment tracking to refresh_tokens
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "active_gn_id" UUID;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "active_team_id" UUID;

-- 6. Backfill existing active Level 4 CDC secretaries into profile_assignments
INSERT INTO "profile_assignments" ("profile_id", "gn_id", "team_id", "valid_from")
SELECT p."id", p."gn_id", p."team_id", p."created_at"
FROM "profiles" p
WHERE p."role" = 'cdc_secretary' 
  AND p."gn_id" IS NOT NULL 
  AND p."is_active" = TRUE
ON CONFLICT DO NOTHING;

