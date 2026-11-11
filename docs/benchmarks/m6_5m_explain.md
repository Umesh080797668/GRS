# M6.5 5M-Row PostgreSQL Duplicate Detection Benchmark

- **Executed At:** 2026-11-11T09:29:24.971Z
- **PostgreSQL Engine:** PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1) on x86_64-pc-linux-gnu, compiled by gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0, 64-bit
- **Total `clients` Rows:** 5,000,003
- **Target Dense Urban GN `clients` Rows:** 30,003
- **Total Table + Indexes Size (`clients`):** 4645 MB (Indexes: 2839 MB)
- **Build Plan SLA Target (§11 M6.5):** `< 300 ms` using indexes

## End-to-End Post-Commit Candidate Lookup + JS Scoring Latency (25 warm runs)

Each run executes `Q1` (Phone/WhatsApp) + `Q2` (Same-Household) + `Q3` (Same-GN `pg_trgm`) concurrently against the **5,000,003-row** table (150 deduplicated candidates fetched & scored per run):

| Metric | Latency (ms) | Status (< 300 ms SLA) |
| :--- | ---: | :--- |
| Min | 52.39 ms | PASS |
| p50 (Median) | 57.41 ms | PASS |
| **p95** | **59.97 ms** | **PASS** |
| Max | 70.32 ms | PASS |

---

## `EXPLAIN (ANALYZE, BUFFERS)` Query Plans

### Q1: Phone / WhatsApp Indexed Lookup (5M rows) (0.85 ms)
```
Unique  (cost=16.92..16.97 rows=2 width=1204) (actual time=0.028..0.031 rows=2 loops=1)
  Buffers: shared hit=9
  ->  Sort  (cost=16.92..16.93 rows=2 width=1204) (actual time=0.028..0.028 rows=3 loops=1)
        Sort Key: clients.id, clients.household_id, clients.gn_id, clients.name, clients.name_norm, clients.age, clients.gender, clients.phone_e164, clients.whatsapp_e164
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=9
        ->  Append  (cost=0.43..16.91 rows=2 width=1204) (actual time=0.012..0.019 rows=3 loops=1)
              Buffers: shared hit=9
              ->  Index Scan using clients_phone_e164_idx on clients  (cost=0.43..8.45 rows=1 width=120) (actual time=0.012..0.013 rows=2 loops=1)
                    Index Cond: ((phone_e164)::text = ANY ('{+94779988776}'::text[]))
                    Filter: ((deleted_at IS NULL) AND (duplicate_of IS NULL))
                    Buffers: shared hit=5
              ->  Index Scan using clients_whatsapp_e164_idx on clients clients_1  (cost=0.43..8.45 rows=1 width=120) (actual time=0.005..0.005 rows=1 loops=1)
                    Index Cond: ((whatsapp_e164)::text = ANY ('{+94779988776}'::text[]))
                    Filter: ((deleted_at IS NULL) AND (duplicate_of IS NULL))
                    Buffers: shared hit=4
Planning:
  Buffers: shared hit=2
Planning Time: 0.118 ms
Execution Time: 0.045 ms
```

### Q2: Same-Household Indexed Lookup (5M rows) (0.75 ms)
```
Bitmap Heap Scan on clients  (cost=5.21..400.09 rows=100 width=120) (actual time=0.021..0.111 rows=103 loops=1)
  Recheck Cond: (household_id = ANY ('{17daae99-286d-49b2-9bb5-63002dd6e188}'::uuid[]))
  Filter: ((deleted_at IS NULL) AND (duplicate_of IS NULL))
  Heap Blocks: exact=103
  Buffers: shared hit=106
  ->  Bitmap Index Scan on clients_household_id_idx  (cost=0.00..5.18 rows=100 width=0) (actual time=0.008..0.008 rows=103 loops=1)
        Index Cond: (household_id = ANY ('{17daae99-286d-49b2-9bb5-63002dd6e188}'::uuid[]))
        Buffers: shared hit=3
Planning:
  Buffers: shared hit=1
Planning Time: 0.061 ms
Execution Time: 0.121 ms
```

### Q3: Same-GN pg_trgm Fuzzy Name Lookup (~30k rows in GN / 5M total) (48.83 ms)
```
Limit  (cost=1952.73..2147.94 rows=50 width=120) (actual time=46.859..47.482 rows=50 loops=1)
  Buffers: shared hit=3978
  ->  Bitmap Heap Scan on clients  (cost=1952.73..3186.42 rows=316 width=120) (actual time=46.858..47.478 rows=50 loops=1)
        Recheck Cond: ((gn_id = 'f8d4cfc1-7322-453f-9fb1-cfab740abede'::uuid) AND ((name_norm)::text % 'nimali kumari perera'::text))
        Rows Removed by Index Recheck: 207
        Filter: ((deleted_at IS NULL) AND (duplicate_of IS NULL))
        Heap Blocks: exact=239
        Buffers: shared hit=3978
        ->  Bitmap Index Scan on clients_gn_name_norm_trgm_idx  (cost=0.00..1952.65 rows=316 width=0) (actual time=45.217..45.217 rows=15002 loops=1)
              Index Cond: ((gn_id = 'f8d4cfc1-7322-453f-9fb1-cfab740abede'::uuid) AND ((name_norm)::text % 'nimali kumari perera'::text))
              Buffers: shared hit=3739
Planning:
  Buffers: shared hit=3
Planning Time: 0.326 ms
Execution Time: 47.648 ms
```

### Q4: Duplicate Review Queue Keyset Query (0.84 ms)
```
Limit  (cost=1.02..1.03 rows=1 width=64) (actual time=0.010..0.010 rows=1 loops=1)
  Buffers: shared hit=1
  ->  Sort  (cost=1.02..1.03 rows=1 width=64) (actual time=0.009..0.009 rows=1 loops=1)
        Sort Key: score DESC, created_at DESC, id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=1
        ->  Seq Scan on duplicate_candidates  (cost=0.00..1.01 rows=1 width=64) (actual time=0.004..0.004 rows=1 loops=1)
              Filter: (status = 'open'::duplicate_status)
              Buffers: shared hit=1
Planning Time: 0.062 ms
Execution Time: 0.019 ms
```
