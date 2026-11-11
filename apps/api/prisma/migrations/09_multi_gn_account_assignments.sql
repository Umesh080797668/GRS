-- GRS Database Migration 09: Multi-GN assignments for CDC Secretaries
-- Allows one CDC Secretary (role = 'cdc_secretary') to hold 2+ active GN
-- assignments simultaneously in account_assignments (matching Decision C23
-- on profile_assignments), while keeping higher territory assignments
-- (District / DS) single-active per profile and preventing duplicate active
-- (profile_id, gn_id) pairs.
--
-- Idempotent: safe to run multiple times.

-- 1. Drop the unconditional one-active-row-per-profile index
DROP INDEX IF EXISTS "aa_one_active_per_profile";

-- 2. Prevent duplicate active assignments for the same (profile_id, gn_id)
CREATE UNIQUE INDEX IF NOT EXISTS "aa_unique_active_profile_gn"
    ON "account_assignments"("profile_id", "gn_id")
    WHERE "valid_to" IS NULL AND "gn_id" IS NOT NULL;

-- 3. Keep higher-tier assignments (District / DS level) one active per profile
CREATE UNIQUE INDEX IF NOT EXISTS "aa_unique_active_profile_higher"
    ON "account_assignments"("profile_id")
    WHERE "valid_to" IS NULL AND "gn_id" IS NULL AND "team_id" IS NULL;

-- 4. Backfill missing ds_id / district_id on GN-linked account_assignments rows
UPDATE "account_assignments" aa
SET
    "ds_id" = COALESCE(aa."ds_id", gn."ds_id"),
    "district_id" = COALESCE(aa."district_id", ds."district_id")
FROM "gn_divisions" gn
JOIN "divisional_secretariats" ds ON ds."id" = gn."ds_id"
WHERE aa."gn_id" = gn."id"
  AND (aa."ds_id" IS NULL OR aa."district_id" IS NULL);

-- 5. Backfill any active profile_assignments rows that were skipped by Migration 07
--    when a CDC Secretary already held multiple active GN divisions.
INSERT INTO "account_assignments"
    ("profile_id", "district_id", "ds_id", "gn_id", "team_id", "valid_from", "valid_to", "assigned_by", "created_at")
SELECT
    pa."profile_id",
    ds."district_id",
    gn."ds_id",
    pa."gn_id",
    pa."team_id",
    pa."valid_from",
    NULL,
    pa."profile_id",
    pa."created_at"
FROM "profile_assignments" pa
JOIN "gn_divisions" gn ON gn."id" = pa."gn_id"
JOIN "divisional_secretariats" ds ON ds."id" = gn."ds_id"
WHERE pa."valid_to" IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM "account_assignments" aa
      WHERE aa."profile_id" = pa."profile_id"
        AND aa."gn_id" = pa."gn_id"
        AND aa."valid_to" IS NULL
  )
ON CONFLICT DO NOTHING;

-- 6. Backfill any active profile with a territory that has no open account_assignments row
INSERT INTO "account_assignments"
    ("profile_id", "district_id", "ds_id", "gn_id", "team_id", "valid_from", "assigned_by", "created_at")
SELECT
    p."id",
    COALESCE(p."district_id", ds."district_id"),
    COALESCE(p."ds_id", gn."ds_id"),
    COALESCE(p."gn_id", t."gn_id"),
    p."team_id",
    p."created_at",
    COALESCE(p."created_by", p."id"),
    p."created_at"
FROM "profiles" p
LEFT JOIN "teams" t ON t."id" = p."team_id"
LEFT JOIN "gn_divisions" gn ON gn."id" = COALESCE(p."gn_id", t."gn_id")
LEFT JOIN "divisional_secretariats" ds ON ds."id" = COALESCE(p."ds_id", gn."ds_id")
WHERE p."is_active" = true
  AND (p."district_id" IS NOT NULL OR p."ds_id" IS NOT NULL OR p."gn_id" IS NOT NULL OR p."team_id" IS NOT NULL)
  AND NOT EXISTS (
      SELECT 1
      FROM "account_assignments" aa
      WHERE aa."profile_id" = p."id"
        AND aa."valid_to" IS NULL
  )
ON CONFLICT DO NOTHING;

