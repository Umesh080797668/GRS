-- Migration 12: Add is_non_beneficiary to households
ALTER TABLE households
ADD COLUMN IF NOT EXISTS is_non_beneficiary BOOLEAN NOT NULL DEFAULT FALSE;

