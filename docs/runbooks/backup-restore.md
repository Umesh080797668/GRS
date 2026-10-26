# Runbook: Daily Backup & Emergency Restore Drill

**Document ID:** RB-001  
**Target Milestone:** M9.3, M9.4  
**Applies to:** Supabase Free Tier PostgreSQL Database  

---

## 1. Overview
The Supabase Free Tier does not include automated point-in-time recovery (PITR) or automated backups, and will pause projects that receive no traffic for a week. To ensure **zero data loss** (Invariant 1), this runbook details:
1. Daily automated encrypted dumps stored off-platform.
2. The keep-alive mechanism to prevent project dormancy.
3. Step-by-step restoration verification drill.

---

## 2. Automated Daily Backup Process
The GitHub Actions workflow `.github/workflows/nightly-backup.yml` executes every night at 00:00 UTC (05:30 IST):
1. Connects using `DIRECT_URL` (direct PostgreSQL connection port 5432).
2. Executes:
   ```bash
   pg_dump "$DIRECT_URL" --format=custom --file=dump.sql
   ```
3. Encrypts the raw dump using AES-256-CBC with the secret `BACKUP_ENCRYPTION_KEY`:
   ```bash
   openssl enc -aes-256-cbc -salt -in dump.sql -out "grs_backup_$(date +%Y%m%d_%H%M%S).dump.enc" -pass "pass:$BACKUP_ENCRYPTION_KEY"
   ```
4. Securely stores the encrypted dump in off-platform cold storage (private S3 / cloud bucket).
5. Deletes local unencrypted `dump.sql`.

---

## 3. Keep-Alive Mechanism
To prevent Supabase projects from automatically pausing due to inactivity:
- A lightweight scheduled ping is sent every 24 hours to `$SUPABASE_URL/rest/v1/` with `$SUPABASE_ANON_KEY`.
- Any ping failure generates an alert.

---

## 4. Emergency Restore Drill (Step-by-Step)

When restoring onto a fresh PostgreSQL / Supabase instance:

### Step 1: Decrypt the Backup
```bash
openssl enc -d -aes-256-cbc -in grs_backup_YYYYMMDD_HHMMSS.dump.enc -out restore.dump -pass "pass:$BACKUP_ENCRYPTION_KEY"
```

### Step 2: Restore Schema & Data
Connect to the clean target database:
```bash
pg_restore --clean --if-exists --no-owner --no-privileges -d "$TARGET_DATABASE_URL" restore.dump
```

### Step 3: Verify Integrity & Constraints
1. Execute count checks:
   ```sql
   SELECT count(*) FROM profiles;
   SELECT count(*) FROM households;
   SELECT count(*) FROM clients;
   ```
2. Check Row Level Security is active:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
   ```
   *Every table must report `rowsecurity = true`.*
3. Run the API health check:
   ```bash
   curl -I https://api.grs.domain/v1/health
   ```

### Step 4: Secure Clean Up
```bash
shred -u restore.dump
```
