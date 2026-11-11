-- =============================================================================
-- GRS Database Migration 10: User Activity & Session Monitoring
-- =============================================================================

-- 1. Track last general API / heartbeat activity separately from last_login_at
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS profiles_last_active_at_idx
  ON profiles (last_active_at);

-- Backfill historical last_active_at for accounts that logged in previously
UPDATE profiles
SET last_active_at = last_login_at
WHERE last_login_at IS NOT NULL
  AND last_active_at IS NULL;

-- 2. User activity sessions table (accurate web & mobile online/duration tracking)
CREATE TABLE IF NOT EXISTS user_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_type    VARCHAR(20) NOT NULL DEFAULT 'web',
  device_id      VARCHAR(100),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at       TIMESTAMPTZ,
  end_reason     VARCHAR(30)
);

CREATE INDEX IF NOT EXISTS user_sessions_profile_ended_active_idx
  ON user_sessions (profile_id, ended_at, last_active_at);

CREATE INDEX IF NOT EXISTS user_sessions_profile_started_idx
  ON user_sessions (profile_id, started_at);

CREATE INDEX IF NOT EXISTS user_sessions_ended_active_idx
  ON user_sessions (ended_at, last_active_at);

-- 3. Row-Level Security on user_sessions (own sessions or Super Admin)
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User sessions read by super admin or self" ON user_sessions;
CREATE POLICY "User sessions read by super admin or self" ON user_sessions
  FOR SELECT TO authenticated
  USING (
    app.me() IS NOT NULL AND (
      app.current_user_role() = 'super_admin' OR
      profile_id = app.current_user_id()
    )
  );

