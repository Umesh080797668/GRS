-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('super_admin', 'admin', 'cg', 'dc', 'sda', 'cdc_secretary', 'team_member');

-- CreateEnum
CREATE TYPE "gender" AS ENUM ('F', 'M');

-- CreateEnum
CREATE TYPE "info_provided_by" AS ENUM ('self', 'mother', 'father', 'sister', 'other');

-- CreateEnum
CREATE TYPE "duplicate_status" AS ENUM ('open', 'confirmed', 'dismissed');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('queued', 'running', 'done', 'failed', 'expired');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_code" VARCHAR(13) NOT NULL,
    "email" VARCHAR(255),
    "pending_email" VARCHAR(255),
    "password_hash" VARCHAR(255) NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "password_expires_at" TIMESTAMPTZ(6),
    "password_changed_at" TIMESTAMPTZ(6),
    "role" "user_role" NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "phone_e164" VARCHAR(20),
    "preferred_language" VARCHAR(5) NOT NULL DEFAULT 'si',
    "created_by" UUID,
    "district_id" UUID,
    "ds_id" UUID,
    "gn_id" UUID,
    "team_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deactivated_at" TIMESTAMPTZ(6),
    "deactivated_by" UUID,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "token_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "device_id" VARCHAR(100),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "purpose" VARCHAR(20) NOT NULL,
    "code_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_by" UUID NOT NULL,
    "role" "user_role" NOT NULL,
    "team_id" UUID,
    "count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_audit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "batch_id" UUID,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(255) NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name_si" VARCHAR(100) NOT NULL,
    "name_ta" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "divisional_secretariats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "district_id" UUID NOT NULL,
    "name_si" VARCHAR(100) NOT NULL,
    "name_ta" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(100) NOT NULL,
    "sdo_name" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "divisional_secretariats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gn_divisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ds_id" UUID NOT NULL,
    "gn_number" VARCHAR(50) NOT NULL,
    "gn_name" VARCHAR(100) NOT NULL,
    "cdc_secretary_id" UUID,
    "secretary_name" VARCHAR(255),
    "secretary_contact" VARCHAR(50),
    "secretary_email" VARCHAR(255),
    "next_serial" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gn_divisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gn_id" UUID NOT NULL,
    "team_no" INTEGER NOT NULL,
    "leader_id" UUID,
    "max_members" INTEGER NOT NULL DEFAULT 10,
    "stats_dirty_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gn_id" UUID NOT NULL,
    "team_id" UUID,
    "district_id" UUID NOT NULL,
    "ds_id" UUID NOT NULL,
    "serial_no" INTEGER NOT NULL,
    "house_no" VARCHAR(50) NOT NULL,
    "house_no_norm" VARCHAR(50) NOT NULL,
    "house_leader_name" VARCHAR(255) NOT NULL,
    "address" TEXT,
    "village_name" VARCHAR(150),
    "is_epf" BOOLEAN NOT NULL DEFAULT false,
    "is_etf" BOOLEAN NOT NULL DEFAULT false,
    "is_aswesuma" BOOLEAN NOT NULL DEFAULT false,
    "is_samurdhi" BOOLEAN NOT NULL DEFAULT false,
    "has_special_needs" BOOLEAN NOT NULL DEFAULT false,
    "target_female" INTEGER NOT NULL DEFAULT 0,
    "target_male" INTEGER NOT NULL DEFAULT 0,
    "age_group_min" INTEGER,
    "age_group_max" INTEGER,
    "lang_sinhala" BOOLEAN NOT NULL DEFAULT false,
    "lang_tamil" BOOLEAN NOT NULL DEFAULT false,
    "lang_english" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_reason" VARCHAR(255),
    "import_batch_id" UUID,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "district_id" UUID NOT NULL,
    "ds_id" UUID NOT NULL,
    "gn_id" UUID NOT NULL,
    "team_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "name_norm" VARCHAR(255) NOT NULL,
    "age" INTEGER NOT NULL,
    "gender" "gender" NOT NULL,
    "address" TEXT,
    "phone_raw" VARCHAR(50),
    "phone_e164" VARCHAR(20),
    "whatsapp_raw" VARCHAR(50),
    "whatsapp_e164" VARCHAR(20),
    "highest_education" VARCHAR(50),
    "highest_vocational" VARCHAR(50),
    "interested_vocational_stream" VARCHAR(50),
    "interested_job" VARCHAR(50),
    "is_epf" BOOLEAN NOT NULL DEFAULT false,
    "is_etf" BOOLEAN NOT NULL DEFAULT false,
    "is_aswesuma" BOOLEAN NOT NULL DEFAULT false,
    "is_samurdhi" BOOLEAN NOT NULL DEFAULT false,
    "has_special_needs" BOOLEAN NOT NULL DEFAULT false,
    "future_hopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "info_provided_by" "info_provided_by" NOT NULL,
    "info_provided_by_other" VARCHAR(255),
    "consent_given" BOOLEAN NOT NULL,
    "consent_at" TIMESTAMPTZ(6),
    "consent_version" VARCHAR(20),
    "collected_by" UUID NOT NULL,
    "collected_at" TIMESTAMPTZ(6) NOT NULL,
    "device_id" VARCHAR(100),
    "client_updated_at" TIMESTAMPTZ(6) NOT NULL,
    "server_version" INTEGER NOT NULL DEFAULT 1,
    "content_hash" VARCHAR(64) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "duplicate_of" UUID,
    "app_version" VARCHAR(20),
    "schema_version" VARCHAR(20),
    "synced_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_audit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "reason" VARCHAR(255),

    CONSTRAINT "client_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duplicate_candidates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_a" UUID NOT NULL,
    "client_b" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "reasons" JSONB NOT NULL,
    "status" "duplicate_status" NOT NULL DEFAULT 'open',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duplicate_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_stats" (
    "team_id" UUID NOT NULL,
    "gn_id" UUID NOT NULL,
    "ds_id" UUID NOT NULL,
    "district_id" UUID NOT NULL,
    "houses_assigned" INTEGER NOT NULL DEFAULT 0,
    "houses_started" INTEGER NOT NULL DEFAULT 0,
    "houses_done" INTEGER NOT NULL DEFAULT 0,
    "clients_count" INTEGER NOT NULL DEFAULT 0,
    "epf_count" INTEGER NOT NULL DEFAULT 0,
    "etf_count" INTEGER NOT NULL DEFAULT 0,
    "aswesuma_count" INTEGER NOT NULL DEFAULT 0,
    "samurdhi_count" INTEGER NOT NULL DEFAULT 0,
    "special_needs_count" INTEGER NOT NULL DEFAULT 0,
    "refreshed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_stats_pkey" PRIMARY KEY ("team_id")
);

-- CreateTable
CREATE TABLE "area_stats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "area_type" VARCHAR(20) NOT NULL,
    "area_id" VARCHAR(50) NOT NULL,
    "houses_assigned" INTEGER NOT NULL DEFAULT 0,
    "houses_started" INTEGER NOT NULL DEFAULT 0,
    "houses_done" INTEGER NOT NULL DEFAULT 0,
    "clients_count" INTEGER NOT NULL DEFAULT 0,
    "epf_count" INTEGER NOT NULL DEFAULT 0,
    "etf_count" INTEGER NOT NULL DEFAULT 0,
    "aswesuma_count" INTEGER NOT NULL DEFAULT 0,
    "samurdhi_count" INTEGER NOT NULL DEFAULT 0,
    "special_needs_count" INTEGER NOT NULL DEFAULT 0,
    "refreshed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "area_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookup_values" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category" VARCHAR(50) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "label_si" VARCHAR(255) NOT NULL,
    "label_ta" VARCHAR(255) NOT NULL,
    "label_en" VARCHAR(255) NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "lookup_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gn_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "rows_total" INTEGER NOT NULL,
    "rows_ok" INTEGER NOT NULL,
    "rows_failed" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'previewed',
    "error_report_path" VARCHAR(255),
    "imported_by" UUID NOT NULL,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_staging" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batch_id" UUID NOT NULL,
    "row_no" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "errors" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_staging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requested_by" UUID NOT NULL,
    "kind" VARCHAR(50) NOT NULL,
    "filters" JSONB NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'queued',
    "file_path" VARCHAR(255),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_releases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" VARCHAR(20) NOT NULL,
    "min_supported_version" VARCHAR(20) NOT NULL,
    "apk_url" VARCHAR(255) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "release_notes" TEXT,
    "released_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "device_id" VARCHAR(100),
    "records_sent" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_code_key" ON "profiles"("user_code");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- CreateIndex
CREATE INDEX "profiles_created_by_idx" ON "profiles"("created_by");

-- CreateIndex
CREATE INDEX "profiles_team_id_idx" ON "profiles"("team_id");

-- CreateIndex
CREATE INDEX "profiles_district_id_idx" ON "profiles"("district_id");

-- CreateIndex
CREATE INDEX "profiles_ds_id_idx" ON "profiles"("ds_id");

-- CreateIndex
CREATE INDEX "profiles_gn_id_idx" ON "profiles"("gn_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_profile_id_idx" ON "refresh_tokens"("profile_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_codes_profile_id_purpose_idx" ON "email_codes"("profile_id", "purpose");

-- CreateIndex
CREATE INDEX "account_audit_target_id_idx" ON "account_audit"("target_id");

-- CreateIndex
CREATE INDEX "account_audit_actor_id_idx" ON "account_audit"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limits_key_key" ON "rate_limits"("key");

-- CreateIndex
CREATE INDEX "rate_limits_key_window_start_idx" ON "rate_limits"("key", "window_start");

-- CreateIndex
CREATE INDEX "divisional_secretariats_district_id_idx" ON "divisional_secretariats"("district_id");

-- CreateIndex
CREATE INDEX "gn_divisions_ds_id_idx" ON "gn_divisions"("ds_id");

-- CreateIndex
CREATE UNIQUE INDEX "gn_divisions_ds_id_gn_number_key" ON "gn_divisions"("ds_id", "gn_number");

-- CreateIndex
CREATE UNIQUE INDEX "teams_leader_id_key" ON "teams"("leader_id");

-- CreateIndex
CREATE INDEX "teams_gn_id_idx" ON "teams"("gn_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_gn_id_team_no_key" ON "teams"("gn_id", "team_no");

-- CreateIndex
CREATE INDEX "households_gn_id_house_no_norm_idx" ON "households"("gn_id", "house_no_norm");

-- CreateIndex
CREATE INDEX "households_team_id_idx" ON "households"("team_id");

-- CreateIndex
CREATE INDEX "households_district_id_idx" ON "households"("district_id");

-- CreateIndex
CREATE INDEX "households_ds_id_idx" ON "households"("ds_id");

-- CreateIndex
CREATE UNIQUE INDEX "households_gn_id_serial_no_key" ON "households"("gn_id", "serial_no");

-- CreateIndex
CREATE INDEX "clients_district_id_created_at_id_idx" ON "clients"("district_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "clients_ds_id_created_at_id_idx" ON "clients"("ds_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "clients_gn_id_created_at_id_idx" ON "clients"("gn_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "clients_team_id_created_at_id_idx" ON "clients"("team_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "clients_collected_by_created_at_id_idx" ON "clients"("collected_by", "created_at", "id");

-- CreateIndex
CREATE INDEX "clients_household_id_idx" ON "clients"("household_id");

-- CreateIndex
CREATE INDEX "clients_phone_e164_idx" ON "clients"("phone_e164");

-- CreateIndex
CREATE INDEX "clients_whatsapp_e164_idx" ON "clients"("whatsapp_e164");

-- CreateIndex
CREATE INDEX "client_audit_client_id_idx" ON "client_audit"("client_id");

-- CreateIndex
CREATE INDEX "duplicate_candidates_status_idx" ON "duplicate_candidates"("status");

-- CreateIndex
CREATE UNIQUE INDEX "duplicate_candidates_client_a_client_b_key" ON "duplicate_candidates"("client_a", "client_b");

-- CreateIndex
CREATE INDEX "team_stats_gn_id_idx" ON "team_stats"("gn_id");

-- CreateIndex
CREATE INDEX "team_stats_ds_id_idx" ON "team_stats"("ds_id");

-- CreateIndex
CREATE INDEX "team_stats_district_id_idx" ON "team_stats"("district_id");

-- CreateIndex
CREATE UNIQUE INDEX "area_stats_area_type_area_id_key" ON "area_stats"("area_type", "area_id");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_values_code_key" ON "lookup_values"("code");

-- CreateIndex
CREATE INDEX "lookup_values_category_sort_idx" ON "lookup_values"("category", "sort");

-- CreateIndex
CREATE INDEX "import_staging_batch_id_row_no_idx" ON "import_staging"("batch_id", "row_no");

-- CreateIndex
CREATE INDEX "export_jobs_requested_by_idx" ON "export_jobs"("requested_by");

-- CreateIndex
CREATE INDEX "export_jobs_status_idx" ON "export_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "app_releases_version_key" ON "app_releases"("version");

-- CreateIndex
CREATE INDEX "sync_log_user_id_created_at_idx" ON "sync_log"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_batches" ADD CONSTRAINT "account_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_audit" ADD CONSTRAINT "account_audit_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_audit" ADD CONSTRAINT "account_audit_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_audit" ADD CONSTRAINT "account_audit_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "account_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "divisional_secretariats" ADD CONSTRAINT "divisional_secretariats_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gn_divisions" ADD CONSTRAINT "gn_divisions_ds_id_fkey" FOREIGN KEY ("ds_id") REFERENCES "divisional_secretariats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_gn_id_fkey" FOREIGN KEY ("gn_id") REFERENCES "gn_divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_gn_id_fkey" FOREIGN KEY ("gn_id") REFERENCES "gn_divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_collected_by_fkey" FOREIGN KEY ("collected_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_audit" ADD CONSTRAINT "client_audit_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_staging" ADD CONSTRAINT "import_staging_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Extensions (M1.1)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Unique partial index on live households (M1.1)
CREATE UNIQUE INDEX IF NOT EXISTS "households_gn_house_no_norm_live_uidx" ON "households"("gn_id", "house_no_norm") WHERE "deleted_at" IS NULL;

-- CHECK constraints (M1.1)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_age_check') THEN
    ALTER TABLE "clients" ADD CONSTRAINT "clients_age_check" CHECK ("age" >= 1 AND "age" <= 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_gender_check') THEN
    ALTER TABLE "clients" ADD CONSTRAINT "clients_gender_check" CHECK ("gender" IN ('F', 'M'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_user_code_check') THEN
    ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_code_check" CHECK ("user_code" ~ '^GRS[0-9]{10}$');
  END IF;
END $$;

-- SQL role_rank() function (M1.2)
CREATE OR REPLACE FUNCTION public.role_rank(role_name text)
RETURNS integer AS $$
BEGIN
  RETURN CASE role_name
    WHEN 'super_admin' THEN 70
    WHEN 'admin' THEN 60
    WHEN 'cg' THEN 50
    WHEN 'dc' THEN 40
    WHEN 'sda' THEN 30
    WHEN 'cdc_secretary' THEN 20
    WHEN 'team_member' THEN 10
    WHEN 'national_admin' THEN 60
    WHEN 'district_coord' THEN 50
    WHEN 'sdo' THEN 40
    WHEN 'ds_admin' THEN 30
    WHEN 'enumerator' THEN 20
    WHEN 'call_center' THEN 10
    ELSE 0
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

