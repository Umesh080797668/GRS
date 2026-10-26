# Runbook: Credential Reissue & Lost Device Incident Response

**Document ID:** RB-002  
**Target Milestone:** M1.4, M4.3, M5.2  
**Applies to:** Super Admin (Level 00) and Admins (Levels 1–4)  

---

## 1. Principles of Credential Handling (Invariant 13 & 14)
1. **Plaintext passwords exist only in memory** during the single creation HTTP response and on the admin's credential sheet. They are **never stored** in the database, storage, logs, or error reports.
2. The server stores only Argon2id hashes.
3. Every generated account must change its password upon first sign-in.
4. Accounts not signed in within 30 days (`INITIAL_PASSWORD_TTL_DAYS`) have their initial passwords expired automatically.

---

## 2. Scenario A: Admin Lost Credential Sheet Before Handout
If an admin generates a batch of accounts (e.g. 20 Level 5 field workers) and loses the downloaded credential sheet before distributing it:

### Resolution Procedure:
1. Navigate to Web Dashboard → **User Management** → **Account Batches**.
2. Select the affected Batch ID.
3. Trigger **Reissue Batch Credentials** (`POST /v1/accounts/batches/:id/reissue`).
4. **Security Filter:** The API will generate new random passwords **only for accounts in that batch that have NEVER signed in** (`last_login_at IS NULL`).
5. A new credential sheet is rendered in the browser.
6. The admin downloads/prints the sheet and immediately clears the screen.

---

## 3. Scenario B: Agent Forgot Password
### If Agent has a Verified Email:
1. Agent taps "Forgot Password" on the mobile login screen (`POST /v1/auth/forgot`).
2. A 6-digit verification code is delivered to their verified email address.
3. Agent enters code and sets new password (`POST /v1/auth/reset`).

### If Agent has NO Verified Email:
1. Agent reports to their supervising Admin or Level 00.
2. The Admin navigates to **User Management** → Selects the User Profile.
3. Clicks **Reset Password** (`POST /v1/accounts/:id/reset-password`).
4. A new random password is generated and displayed once on screen.
5. `token_version` is incremented, terminating any lingering session.
6. Admin conveys the new temporary password to the agent.
7. Agent logs in and is immediately forced to set a new password.

---

## 4. Scenario C: Agent Lost Phone or Stolen Device
If an agent's device is lost or stolen in the field:

### Immediate Remediation:
1. Admin or Level 00 immediately invokes **Deactivate Account** (`POST /v1/accounts/:id/deactivate`).
2. The database updates:
   - `is_active = false`
   - `token_version = token_version + 1`
   - `deactivated_at = now()`
   - `deactivated_by = actor_id`
3. Audit log written to `account_audit`.
4. **Immediate Effect:** Any token presented by the lost device is rejected with HTTP 401 on its next request. If direct Supabase access is enabled, `app.me()` returns null and RLS denies all reads/writes instantly.
5. Local data on the device remains encrypted with SQLCipher via Android Keystore.
