-- =============================================================================
-- GRS Database Migration 08: GN division uniqueness by (ds_id, gn_number, gn_name)
-- Allows multiple GN areas under the same DS division to share a gn_number
-- (or share a gn_name with a different gn_number), while forbidding identical
-- (ds_id, gn_number, gn_name) duplicates (case-insensitive).
-- =============================================================================

DROP INDEX IF EXISTS "gn_divisions_ds_id_gn_number_key";
ALTER TABLE "gn_divisions" DROP CONSTRAINT IF EXISTS "gn_divisions_ds_id_gn_number_key";

CREATE INDEX IF NOT EXISTS "gn_divisions_ds_id_gn_number_idx"
    ON "gn_divisions"("ds_id", "gn_number");

CREATE UNIQUE INDEX IF NOT EXISTS "gn_divisions_ds_id_gn_number_gn_name_key"
    ON "gn_divisions"("ds_id", "gn_number", "gn_name");

CREATE UNIQUE INDEX IF NOT EXISTS "gn_divisions_ds_id_lower_number_name_key"
    ON "gn_divisions"("ds_id", LOWER("gn_number"), LOWER("gn_name"));

