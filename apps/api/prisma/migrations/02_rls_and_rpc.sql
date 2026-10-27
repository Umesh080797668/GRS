-- =============================================================================
-- GRS Database Migration 02: Row Level Security (RLS) & RPCs
-- Authoritative definition per Agent Build Plan v1.2 Section 5.4, 5.5 (M1.12)
-- =============================================================================

-- 1. Helper Schema
CREATE SCHEMA IF NOT EXISTS app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE ALL ON SCHEMA app FROM anon;
GRANT USAGE ON SCHEMA app TO authenticated, service_role, postgres;

-- 2. Helper function: app.me()
-- Returns profile of the authenticated caller by auth.uid() if active
CREATE OR REPLACE FUNCTION app.me()
RETURNS profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
  SELECT p.*
  FROM profiles p
  WHERE p.id = auth.uid()
    AND p.is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION app.me() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION app.me() FROM anon, public;

-- Convenience scalar extractors
CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
  SELECT (app.me()).id;
$$;

CREATE OR REPLACE FUNCTION app.current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
  SELECT (app.me()).role;
$$;

CREATE OR REPLACE FUNCTION app.current_team_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
  SELECT (app.me()).team_id;
$$;

CREATE OR REPLACE FUNCTION app.current_ds_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
  SELECT (app.me()).ds_id;
$$;

CREATE OR REPLACE FUNCTION app.current_district_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
  SELECT (app.me()).district_id;
$$;

GRANT EXECUTE ON FUNCTION app.current_user_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.current_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.current_team_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.current_ds_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.current_district_id() TO authenticated, service_role;

-- 3. Helper function: app.can_see(...)
-- Evaluates hierarchical area scope per Section 5.4
CREATE OR REPLACE FUNCTION app.can_see(
  target_district_id UUID,
  target_ds_id UUID,
  target_gn_id UUID,
  target_team_id UUID,
  target_collected_by UUID
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  me profiles;
BEGIN
  me := app.me();
  IF me IS NULL THEN
    RETURN false;
  END IF;

  -- super_admin (L00) sees everything
  IF me.role = 'super_admin' THEN
    RETURN true;
  END IF;

  -- admin (L0) and cg (L1) see national scope
  IF me.role IN ('admin', 'cg') THEN
    RETURN true;
  END IF;

  -- dc (L2) sees rows in their district_id or own entries
  IF me.role = 'dc' THEN
    RETURN (target_district_id = me.district_id OR target_collected_by = me.id);
  END IF;

  -- sda (L3) sees rows in their ds_id or own entries
  IF me.role = 'sda' THEN
    RETURN (target_ds_id = me.ds_id OR target_collected_by = me.id);
  END IF;

  -- cdc_secretary (L4) sees rows in their team_id or own entries
  IF me.role = 'cdc_secretary' THEN
    RETURN (target_team_id = me.team_id OR target_collected_by = me.id);
  END IF;

  -- team_member (L5) sees rows collected by themselves
  IF me.role = 'team_member' THEN
    RETURN (target_collected_by = me.id);
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION app.can_see(UUID, UUID, UUID, UUID, UUID) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION app.can_see(UUID, UUID, UUID, UUID, UUID) FROM anon, public;

-- 4. RPC function: rpc_house_availability(target_gn_id UUID)
-- Security definer: allows checking whether a house is assigned to a team without leaking PII (C4)
CREATE OR REPLACE FUNCTION public.rpc_house_availability(target_gn_id UUID)
RETURNS TABLE (
  house_no VARCHAR(50),
  serial_no INT,
  team_no INT,
  is_taken BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  me profiles;
BEGIN
  me := app.me();
  IF me IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: account inactive or invalid session' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    h.house_no,
    h.serial_no,
    t.team_no,
    (h.team_id IS NOT NULL) AS is_taken
  FROM households h
  LEFT JOIN teams t ON t.id = h.team_id
  WHERE h.gn_id = target_gn_id
    AND h.deleted_at IS NULL
  ORDER BY h.serial_no ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_house_availability(UUID) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_house_availability(UUID) FROM anon, public;

-- 5. Enable and Force RLS on all 23 database tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE email_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE account_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE account_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts FORCE ROW LEVEL SECURITY;
ALTER TABLE divisional_secretariats ENABLE ROW LEVEL SECURITY;
ALTER TABLE divisional_secretariats FORCE ROW LEVEL SECURITY;
ALTER TABLE gn_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gn_divisions FORCE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams FORCE ROW LEVEL SECURITY;
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE households FORCE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
ALTER TABLE client_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE duplicate_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE duplicate_candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE team_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_stats FORCE ROW LEVEL SECURITY;
ALTER TABLE area_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_stats FORCE ROW LEVEL SECURITY;
ALTER TABLE lookup_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE lookup_values FORCE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE import_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_staging FORCE ROW LEVEL SECURITY;
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE app_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_releases FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log FORCE ROW LEVEL SECURITY;

-- 6. Reference Data Policies (Readable by any authenticated active user)
DROP POLICY IF EXISTS "Reference data read policy" ON districts;
CREATE POLICY "Reference data read policy" ON districts FOR SELECT TO authenticated USING (app.me() IS NOT NULL);

DROP POLICY IF EXISTS "Reference data read policy" ON divisional_secretariats;
CREATE POLICY "Reference data read policy" ON divisional_secretariats FOR SELECT TO authenticated USING (app.me() IS NOT NULL);

DROP POLICY IF EXISTS "Reference data read policy" ON gn_divisions;
CREATE POLICY "Reference data read policy" ON gn_divisions FOR SELECT TO authenticated USING (app.me() IS NOT NULL);

DROP POLICY IF EXISTS "Reference data read policy" ON teams;
CREATE POLICY "Reference data read policy" ON teams FOR SELECT TO authenticated USING (app.me() IS NOT NULL);

DROP POLICY IF EXISTS "Reference data read policy" ON lookup_values;
CREATE POLICY "Reference data read policy" ON lookup_values FOR SELECT TO authenticated USING (app.me() IS NOT NULL);

DROP POLICY IF EXISTS "Reference data read policy" ON app_releases;
CREATE POLICY "Reference data read policy" ON app_releases FOR SELECT TO authenticated USING (app.me() IS NOT NULL);

-- 7. Profiles Policies
DROP POLICY IF EXISTS "Profiles read in scope" ON profiles;
CREATE POLICY "Profiles read in scope" ON profiles FOR SELECT TO authenticated
USING (
  app.me() IS NOT NULL AND (
    id = app.current_user_id() OR
    app.current_user_role() = 'super_admin' OR
    (app.current_user_role() = 'cdc_secretary' AND team_id = app.current_team_id()) OR
    (app.current_user_role() = 'sda' AND ds_id = app.current_ds_id()) OR
    (app.current_user_role() = 'dc' AND district_id = app.current_district_id()) OR
    app.current_user_role() IN ('admin', 'cg')
  )
);

-- 8. Households Policies (Read where in scope, Update only for L4 of team and L00)
DROP POLICY IF EXISTS "Households read in scope" ON households;
CREATE POLICY "Households read in scope" ON households FOR SELECT TO authenticated
USING (
  app.can_see(district_id, ds_id, gn_id, team_id, created_by)
);

DROP POLICY IF EXISTS "Households update for L4 and L00" ON households;
CREATE POLICY "Households update for L4 and L00" ON households FOR UPDATE TO authenticated
USING (
  app.me() IS NOT NULL AND (
    app.current_user_role() = 'super_admin' OR
    (app.current_user_role() = 'cdc_secretary' AND team_id = app.current_team_id())
  )
);

-- 9. Clients Policies (Read where in scope, Update only for L4 of team and L00)
DROP POLICY IF EXISTS "Clients read in scope" ON clients;
CREATE POLICY "Clients read in scope" ON clients FOR SELECT TO authenticated
USING (
  app.can_see(district_id, ds_id, gn_id, team_id, collected_by)
);

DROP POLICY IF EXISTS "Clients update for L4 and L00" ON clients;
CREATE POLICY "Clients update for L4 and L00" ON clients FOR UPDATE TO authenticated
USING (
  app.me() IS NOT NULL AND (
    app.current_user_role() = 'super_admin' OR
    (app.current_user_role() = 'cdc_secretary' AND team_id = app.current_team_id())
  )
);

-- 10. Summary Tables Policies
DROP POLICY IF EXISTS "Team stats read in scope" ON team_stats;
CREATE POLICY "Team stats read in scope" ON team_stats FOR SELECT TO authenticated
USING (
  app.can_see(district_id, ds_id, gn_id, team_id, NULL)
);

DROP POLICY IF EXISTS "Area stats read" ON area_stats;
CREATE POLICY "Area stats read" ON area_stats FOR SELECT TO authenticated
USING (
  app.me() IS NOT NULL
);

-- 11. Audits & Duplicate candidates
DROP POLICY IF EXISTS "Client audit read in scope" ON client_audit;
CREATE POLICY "Client audit read in scope" ON client_audit FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = client_id
      AND app.can_see(c.district_id, c.ds_id, c.gn_id, c.team_id, c.collected_by)
  )
);

DROP POLICY IF EXISTS "Duplicate candidates read in scope" ON duplicate_candidates;
CREATE POLICY "Duplicate candidates read in scope" ON duplicate_candidates FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = client_a
      AND app.can_see(c.district_id, c.ds_id, c.gn_id, c.team_id, c.collected_by)
  )
);
