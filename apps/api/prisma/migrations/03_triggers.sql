-- =============================================================================
-- GRS Database Migration 03: Database Triggers & Client Auditing
-- Authoritative definition per Agent Build Plan v1.2 Section 5.5 Rule 5 (M1.13)
-- =============================================================================

-- 1. Timestamp Auto-Update Trigger Function
CREATE OR REPLACE FUNCTION app.fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Version Bump Trigger Functions
CREATE OR REPLACE FUNCTION app.fn_bump_household_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app.fn_bump_client_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.server_version = OLD.server_version + 1;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Immutable Columns Trigger Functions
CREATE OR REPLACE FUNCTION app.fn_check_client_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Column id is immutable and cannot be modified' USING ERRCODE = '42501';
  END IF;
  IF NEW.collected_by <> OLD.collected_by THEN
    RAISE EXCEPTION 'Column collected_by is immutable and cannot be modified' USING ERRCODE = '42501';
  END IF;
  IF NEW.household_id <> OLD.household_id THEN
    RAISE EXCEPTION 'Column household_id is immutable and cannot be modified' USING ERRCODE = '42501';
  END IF;
  IF NEW.district_id <> OLD.district_id THEN
    RAISE EXCEPTION 'Column district_id is immutable and cannot be modified' USING ERRCODE = '42501';
  END IF;
  IF NEW.ds_id <> OLD.ds_id THEN
    RAISE EXCEPTION 'Column ds_id is immutable and cannot be modified' USING ERRCODE = '42501';
  END IF;
  IF NEW.gn_id <> OLD.gn_id THEN
    RAISE EXCEPTION 'Column gn_id is immutable and cannot be modified' USING ERRCODE = '42501';
  END IF;
  IF NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Column created_at is immutable and cannot be modified' USING ERRCODE = '42501';
  END IF;
  IF NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'Column created_by is immutable and cannot be modified' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app.fn_check_household_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Column id is immutable and cannot be modified' USING ERRCODE = '42501';
  END IF;
  IF NEW.serial_no <> OLD.serial_no THEN
    RAISE EXCEPTION 'Column serial_no is immutable and cannot be modified' USING ERRCODE = '42501';
  END IF;
  IF NEW.district_id <> OLD.district_id THEN
    RAISE EXCEPTION 'Column district_id is immutable and cannot be modified' USING ERRCODE = '42501';
  END IF;
  IF NEW.ds_id <> OLD.ds_id THEN
    RAISE EXCEPTION 'Column ds_id is immutable and cannot be modified' USING ERRCODE = '42501';
  END IF;
  IF NEW.gn_id <> OLD.gn_id THEN
    RAISE EXCEPTION 'Column gn_id is immutable and cannot be modified' USING ERRCODE = '42501';
  END IF;
  IF NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Column created_at is immutable and cannot be modified' USING ERRCODE = '42501';
  END IF;
  IF NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'Column created_by is immutable and cannot be modified' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Client Audit Trigger Function
CREATE OR REPLACE FUNCTION app.fn_client_audit()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO client_audit (
    id,
    client_id,
    changed_by,
    changed_at,
    before,
    after,
    reason
  ) VALUES (
    gen_random_uuid(),
    NEW.id,
    COALESCE(NEW.updated_by, OLD.collected_by),
    NOW(),
    to_jsonb(OLD),
    to_jsonb(NEW),
    'client_record_update'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Attach Triggers to households
DROP TRIGGER IF EXISTS trg_household_immutable ON households;
CREATE TRIGGER trg_household_immutable
BEFORE UPDATE ON households
FOR EACH ROW EXECUTE FUNCTION app.fn_check_household_immutable();

DROP TRIGGER IF EXISTS trg_household_version_bump ON households;
CREATE TRIGGER trg_household_version_bump
BEFORE UPDATE ON households
FOR EACH ROW EXECUTE FUNCTION app.fn_bump_household_version();

-- 6. Attach Triggers to clients
DROP TRIGGER IF EXISTS trg_client_immutable ON clients;
CREATE TRIGGER trg_client_immutable
BEFORE UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION app.fn_check_client_immutable();

DROP TRIGGER IF EXISTS trg_client_version_bump ON clients;
CREATE TRIGGER trg_client_version_bump
BEFORE UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION app.fn_bump_client_version();

DROP TRIGGER IF EXISTS trg_client_audit_log ON clients;
CREATE TRIGGER trg_client_audit_log
AFTER UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION app.fn_client_audit();
