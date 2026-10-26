# Runbook: District-by-District Scale & Capacity Rollout

**Document ID:** RB-004  
**Target Milestone:** M9.2, M9.6, M11  
**Applies to:** DevOps & Technical Leads  

---

## 1. Scale Architecture Principles (Section 8.5)
1. **Demand-Driven Sync:** Phones sync only when pending records exist (`pending > 0`). Never on fixed periodic timers.
2. **Paced Jitter:** Background sync introduces randomized delays `[0, SYNC_JITTER_MAX_SECONDS]` (default 120s) to flatten traffic spikes.
3. **Bulk Upsert:** Push batches (up to 50 records) execute via a single multi-row `INSERT ... ON CONFLICT` database statement.
4. **Pre-Calculated Summaries:** Dashboards query `team_stats` and `area_stats`, refreshed out-of-band by background jobs, never performing `COUNT(*)` over millions of client records.

---

## 2. District-by-District Rollout Checklist

Before expanding the campaign to a new District:

### 1. Capacity Evaluation (M9.6 Gate)
Check current metrics in Supabase & Vercel consoles:
- Database disk storage vs free-tier 500 MB limit
- Monthly bandwidth egress vs free-tier 5 GB limit
- Concurrent connection pooler saturation vs limits
- If any metric exceeds 70% of free tier threshold, trigger the **Supabase Pro / Compute upgrade** in writing with the project owner.

### 2. Pre-Rollout Load Test
Simulate the target agent volume for the incoming district during the 10:00–15:00 window:
```bash
k6 run --vus <AGENT_CONCURRENCY> --duration 30m tests/load/peak-sync-simulation.js
```
**Pass Criteria:**
- Push latency (p95) < 2.0s
- Unhandled error rate < 1%
- Proper `429 Too Many Requests` + `Retry-After` header behavior when artificial limits trip

### 3. Verification Post-Rollout
- Check error tracking (Sentry) for any 5xx spikes or unhandled exceptions.
- Verify summary table consistency with nightly SQL audit jobs:
  ```sql
  SELECT * FROM app.check_stats_drift();
  ```
  *(Expected drift = 0).*
