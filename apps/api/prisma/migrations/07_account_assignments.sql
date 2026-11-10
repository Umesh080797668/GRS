-- =============================================================================
-- GRS Database Migration 07: account_assignments — generalised territory table
-- Separates identity (profile) from territory (assignment).
-- Backfills from profile_assignments for CDC Secretary records.
-- =============================================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS "account_assignments" (
    "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
    "profile_id"    UUID        NOT NULL,
    -- Exactly one territory column is non-null; others are null.
    "district_id"   UUID,
    "ds_id"         UUID,
    "gn_id"         UUID,
    "team_id"       UUID,
    "valid_from"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to"      TIMESTAMPTZ,
    "assigned_by"   UUID        NOT NULL,
    "ended_by"      UUID,
    "note"          TEXT,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_assignments_pkey" PRIMARY KEY ("id")
);

-- 2. FK constraints
ALTER TABLE "account_assignments"
    ADD CONSTRAINT "aa_profile_fk"
        FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_assignments"
    ADD CONSTRAINT "aa_district_fk"
        FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_assignments"
    ADD CONSTRAINT "aa_ds_fk"
        FOREIGN KEY ("ds_id") REFERENCES "divisional_secretariats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_assignments"
    ADD CONSTRAINT "aa_gn_fk"
        FOREIGN KEY ("gn_id") REFERENCES "gn_divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_assignments"
    ADD CONSTRAINT "aa_team_fk"
        FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_assignments"
    ADD CONSTRAINT "aa_assigned_by_fk"
        FOREIGN KEY ("assigned_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_assignments"
    ADD CONSTRAINT "aa_ended_by_fk"
        FOREIGN KEY ("ended_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. CHECK: at least one territory column must be non-null
ALTER TABLE "account_assignments"
    ADD CONSTRAINT "aa_at_least_one_territory"
    CHECK (
        district_id IS NOT NULL OR
        ds_id IS NOT NULL OR
        gn_id IS NOT NULL OR
        team_id IS NOT NULL
    );

-- 4. Indices
CREATE INDEX IF NOT EXISTS "aa_profile_id_idx"   ON "account_assignments"("profile_id");
CREATE INDEX IF NOT EXISTS "aa_gn_id_idx"        ON "account_assignments"("gn_id");
CREATE INDEX IF NOT EXISTS "aa_ds_id_idx"        ON "account_assignments"("ds_id");
CREATE INDEX IF NOT EXISTS "aa_district_id_idx"  ON "account_assignments"("district_id");
CREATE INDEX IF NOT EXISTS "aa_team_id_idx"      ON "account_assignments"("team_id");
CREATE INDEX IF NOT EXISTS "aa_valid_to_idx"     ON "account_assignments"("valid_to");

-- 5. ONE ACTIVE ASSIGNMENT PER PERSON at any territory level (applies to ALL roles).
--    partial unique index on profile_id WHERE valid_to IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS "aa_one_active_per_profile"
    ON "account_assignments"("profile_id")
    WHERE "valid_to" IS NULL;

-- 6. Enable RLS (policies follow in a later RPC migration)
ALTER TABLE "account_assignments" ENABLE ROW LEVEL SECURITY;

-- 7. Backfill from profile_assignments (CDC Secretary legacy records)
INSERT INTO "account_assignments"
    ("profile_id", "gn_id", "team_id", "valid_from", "valid_to", "assigned_by", "created_at")
SELECT
    pa."profile_id",
    pa."gn_id",
    pa."team_id",
    pa."valid_from",
    pa."valid_to",
    pa."profile_id",   -- assigned_by: self (no actor stored in legacy table)
    pa."created_at"
FROM "profile_assignments" pa
ON CONFLICT DO NOTHING;
