/**
 * M6.5 5M-Row PostgreSQL Benchmark & Index Verification Script
 *
 * Usage:
 *   DATABASE_URL="postgresql://postgres:postgres@localhost:55432/grs_test" node scripts/benchmarks/m6_duplicate_5m_bench.cjs
 *
 * SAFETY: Refuses to run against non-local databases unless ALLOW_REMOTE_BENCH=1 is set.
 */

const fs = require('fs');
const path = require('path');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('ERROR: DATABASE_URL is required');
  process.exit(1);
}

const isLocalHost =
  dbUrl.includes('localhost') ||
  dbUrl.includes('127.0.0.1') ||
  dbUrl.includes('postgres:postgres@');
if (!isLocalHost && process.env.ALLOW_REMOTE_BENCH !== '1') {
  console.error('REFUSING TO SEED 5M SYNTHETIC ROWS ON NON-LOCAL DATABASE!');
  process.exit(1);
}

const { PrismaClient } = require(
  path.resolve(__dirname, '../../apps/api/node_modules/@prisma/client'),
);

let scoreDuplicatePair;
for (const candidatePath of [
  path.resolve(__dirname, '../../apps/api/dist/src/duplicates/duplicate-scoring.js'),
  path.resolve(__dirname, '../../apps/api/dist/duplicates/duplicate-scoring.js'),
]) {
  if (fs.existsSync(candidatePath)) {
    ({ scoreDuplicatePair } = require(candidatePath));
    break;
  }
}
if (!scoreDuplicatePair) {
  console.error('ERROR: Compiled duplicate-scoring.js not found. Run pnpm --filter api run build first.');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

async function runExplain(label, sql, params = []) {
  const explainSql = `EXPLAIN (ANALYZE, BUFFERS) ${sql}`;
  const start = performance.now();
  const rows = await prisma.$queryRawUnsafe(explainSql, ...params);
  const elapsedMs = performance.now() - start;
  const planLines = rows.map((r) => r['QUERY PLAN']);
  return { label, elapsedMs, plan: planLines.join('\n') };
}

async function main() {
  const TARGET_ROWS = Number(process.env.BENCH_ROWS || 5000000);
  const BATCH_SIZE = 500000;
  const t0 = performance.now();

  console.log(`\n=== M6.5 5M-Row Duplicate Detection Benchmark (target=${TARGET_ROWS.toLocaleString()}) ===`);

  await prisma.$connect();

  // Check if already seeded cleanly at >= TARGET_ROWS
  const countRes = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::bigint AS cnt FROM "clients";`);
  const existingCount = Number(countRes[0].cnt);

  let targetGnId;
  let targetHouseId;
  let targetPhone;
  let targetNameNorm = 'nimali kumari perera';

  if (existingCount >= TARGET_ROWS) {
    console.log(`Reusing existing ${existingCount.toLocaleString()} clients rows in DB.`);
    const sample = await prisma.$queryRawUnsafe(`
      SELECT id, gn_id, household_id, phone_e164, name_norm
      FROM "clients"
      WHERE "name_norm" = $1
      LIMIT 1;
    `, targetNameNorm);
    if (sample.length > 0) {
      targetGnId = sample[0].gn_id;
      targetHouseId = sample[0].household_id;
      targetPhone = sample[0].phone_e164;
    }
  }

  if (!targetGnId) {
    console.log('1/4 Seeding reference hierarchy (5 districts, 25 DS, 1,000 GNs, 1,000 teams, 50,000 houses)...');

    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "duplicate_candidates", "client_audit", "clients", "households", "teams", "gn_divisions", "divisional_secretariats", "districts", "profiles" CASCADE;`);

    await prisma.$executeRawUnsafe(`
      WITH d AS (
        INSERT INTO "districts" ("id", "name_si", "name_ta", "name_en")
        SELECT gen_random_uuid(), 'Dist ' || i, 'Dist ' || i, 'District ' || i
        FROM generate_series(1, 5) AS s(i)
        RETURNING id
      ),
      d_idx AS (
        SELECT id, row_number() OVER () - 1 AS rn FROM d
      ),
      ds AS (
        INSERT INTO "divisional_secretariats" ("id", "district_id", "name_si", "name_ta", "name_en")
        SELECT gen_random_uuid(), d_idx.id, 'DS ' || i, 'DS ' || i, 'DS ' || i
        FROM generate_series(1, 25) AS s(i)
        JOIN d_idx ON d_idx.rn = ((s.i - 1) % 5)
        RETURNING id, district_id
      ),
      ds_idx AS (
        SELECT id, district_id, row_number() OVER () - 1 AS rn FROM ds
      ),
      gns AS (
        INSERT INTO "gn_divisions" ("id", "ds_id", "gn_number", "gn_name")
        SELECT gen_random_uuid(), ds_idx.id, 'GN-' || lpad(i::text, 4, '0'), 'Benchmark GN ' || i
        FROM generate_series(1, 1000) AS s(i)
        JOIN ds_idx ON ds_idx.rn = ((s.i - 1) % 25)
        RETURNING id
      ),
      gn_idx AS (
        SELECT id, row_number() OVER () - 1 AS rn FROM gns
      )
      INSERT INTO "teams" ("id", "gn_id", "team_no", "max_members")
      SELECT gen_random_uuid(), gn_idx.id, 1, 10
      FROM gn_idx;
    `);

    const profRes = await prisma.$queryRawUnsafe(`
      INSERT INTO "profiles" ("id", "user_code", "password_hash", "role", "full_name", "phone_e164")
      VALUES (gen_random_uuid(), 'GRS9999999999', 'hash', 'admin', 'Benchmark User', '+94770000001')
      RETURNING id;
    `);
    const actorId = profRes[0].id;

    await prisma.$executeRawUnsafe(`
      WITH ref AS (
        SELECT t.id AS team_id, g.id AS gn_id, ds.id AS ds_id, ds.district_id,
               row_number() OVER (ORDER BY g.gn_number) - 1 AS rn
        FROM "teams" t
        JOIN "gn_divisions" g ON g.id = t.gn_id
        JOIN "divisional_secretariats" ds ON ds.id = g.ds_id
      )
      INSERT INTO "households" ("id", "gn_id", "team_id", "district_id", "ds_id", "serial_no", "house_no", "house_no_norm", "house_leader_name", "created_by")
      SELECT
        gen_random_uuid(),
        ref.gn_id,
        ref.team_id,
        ref.district_id,
        ref.ds_id,
        s.i,
        'B-' || s.i,
        'B-' || s.i,
        'Leader ' || s.i,
        $1::uuid
      FROM generate_series(1, 50000) AS s(i)
      JOIN ref ON ref.rn = ((s.i - 1) % 1000);
    `, actorId);

    const hSample = await prisma.$queryRawUnsafe(`
      SELECT h.id AS house_id, h.gn_id
      FROM "households" h
      JOIN "gn_divisions" g ON g.id = h.gn_id
      ORDER BY g.gn_number ASC, h.serial_no ASC
      LIMIT 1;
    `);
    targetGnId = hSample[0].gn_id;
    targetHouseId = hSample[0].house_id;

    console.log(`2/4 Bulk inserting ${TARGET_ROWS.toLocaleString()} clients in ${TARGET_ROWS / BATCH_SIZE} batches of ${BATCH_SIZE.toLocaleString()}...`);
    const seedStart = performance.now();

    for (let batch = 0; batch < TARGET_ROWS / BATCH_SIZE; batch++) {
      const startIdx = batch * BATCH_SIZE + 1;
      const endIdx = (batch + 1) * BATCH_SIZE;
      const bStart = performance.now();

      await prisma.$executeRawUnsafe(`
        WITH h_arr AS (
          SELECT
            array_agg(id ORDER BY serial_no) AS h_ids,
            array_agg(team_id ORDER BY serial_no) AS t_ids,
            array_agg(gn_id ORDER BY serial_no) AS g_ids,
            array_agg(ds_id ORDER BY serial_no) AS ds_ids,
            array_agg(district_id ORDER BY serial_no) AS d_ids
          FROM "households"
        ),
        vocab AS (
          SELECT
            ARRAY['kamal','sunil','nimal','ruwan','saman','priyantha','chathura','nuwan','dinesh','lasith','nimali','dilani','sanduni','amaya','tharushi','harshani','anoma','malini','shirani','irosha','arjun','vijay','karthik','suresh','ramesh','kavitha','priya','divya','meena','janani']::text[] AS fnames,
            ARRAY['perera','silva','fernando','jayawardena','bandara','ratnayake','wickramasinghe','senanayake','rajapaksa','herath','gunasekara','dissanayake','ranasinghe','karunaratne','pathirana','weerasinghe','gamage','mendis','liyanage','de silva','selvam','rajan','nadesan','krishnan','shanmugam','kumara','kumari','lakmali','madushani','chandrika']::text[] AS lnames
        )
        INSERT INTO "clients" (
          "id", "household_id", "district_id", "ds_id", "gn_id", "team_id",
          "name", "name_norm", "age", "gender",
          "phone_raw", "phone_e164", "whatsapp_raw", "whatsapp_e164",
          "info_provided_by", "consent_given",
          "collected_by", "collected_at", "client_updated_at", "content_hash", "created_by"
        )
        SELECT
          gen_random_uuid(),
          h_arr.h_ids[1 + ((s.i - 1) % 50000)],
          h_arr.d_ids[1 + ((s.i - 1) % 50000)],
          h_arr.ds_ids[1 + ((s.i - 1) % 50000)],
          CASE WHEN (s.i % 200 = 0) THEN $1::uuid ELSE h_arr.g_ids[1 + ((s.i - 1) % 50000)] END,
          h_arr.t_ids[1 + ((s.i - 1) % 50000)],
          initcap(vocab.fnames[1 + (s.i % 30)] || ' ' || vocab.lnames[1 + ((s.i / 30) % 30)] || ' ' || (s.i % 97)),
          vocab.fnames[1 + (s.i % 30)] || ' ' || vocab.lnames[1 + ((s.i / 30) % 30)] || ' ' || (s.i % 97),
          18 + (s.i % 65),
          CASE WHEN s.i % 2 = 0 THEN 'F'::gender ELSE 'M'::gender END,
          '07' || lpad((10000000 + (s.i % 79999999))::text, 8, '0'),
          '+947' || lpad((10000000 + (s.i % 79999999))::text, 8, '0'),
          '07' || lpad((10000000 + (s.i % 79999999))::text, 8, '0'),
          '+947' || lpad((10000000 + (s.i % 79999999))::text, 8, '0'),
          'self'::info_provided_by,
          true,
          $2::uuid,
          NOW(),
          NOW(),
          md5(s.i::text),
          $2::uuid
        FROM generate_series($3::int, $4::int) AS s(i)
        CROSS JOIN h_arr
        CROSS JOIN vocab;
      `, targetGnId, actorId, startIdx, endIdx);

      console.log(`   Inserted rows ${startIdx.toLocaleString()}..${endIdx.toLocaleString()} in ${((performance.now() - bStart) / 1000).toFixed(2)}s`);
    }

    // Plant target matched candidates inside targetGnId so candidate queries actually return and score pairs
    targetPhone = '+94779988776';
    const hInfo = await prisma.$queryRawUnsafe(`SELECT district_id, ds_id, gn_id, team_id FROM "households" WHERE id = $1::uuid`, targetHouseId);
    const planted = await prisma.$queryRawUnsafe(`
      INSERT INTO "clients" (
        "id", "household_id", "district_id", "ds_id", "gn_id", "team_id",
        "name", "name_norm", "age", "gender",
        "phone_raw", "phone_e164", "whatsapp_raw", "whatsapp_e164",
        "info_provided_by", "consent_given",
        "collected_by", "collected_at", "client_updated_at", "content_hash", "created_by"
      )
      VALUES
        (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 'Mrs. Nimali Kumari Perera', 'nimali kumari perera', 34, 'F'::gender, '0779988776', '+94779988776', '0779988776', '+94779988776', 'self'::info_provided_by, true, $6::uuid, NOW(), NOW(), 'planted-1', $6::uuid),
        (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 'Nimali K. Perera', 'nimali perera', 34, 'F'::gender, '0779988776', '+94779988776', NULL, NULL, 'self'::info_provided_by, true, $6::uuid, NOW(), NOW(), 'planted-2', $6::uuid),
        (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 'Nimali Kumaree Perera', 'nimali kumaree perera', 34, 'F'::gender, '0711112223', '+94711112223', NULL, NULL, 'self'::info_provided_by, true, $6::uuid, NOW(), NOW(), 'planted-3', $6::uuid)
      RETURNING id;
    `, targetHouseId, hInfo[0].district_id, hInfo[0].ds_id, hInfo[0].gn_id, hInfo[0].team_id, actorId);

    await prisma.$executeRawUnsafe(`
      INSERT INTO "duplicate_candidates" ("id", "client_a", "client_b", "score", "reasons", "status")
      SELECT
        gen_random_uuid(),
        LEAST($1::uuid, $2::uuid),
        GREATEST($1::uuid, $2::uuid),
        98,
        '{"factors":["exact_phone","high_name_similarity","same_household","same_gn"]}'::jsonb,
        'open'::duplicate_status
      ON CONFLICT ("client_a", "client_b") DO NOTHING;
    `, planted[0].id, planted[1].id);

    console.log(`   Total bulk seed time: ${((performance.now() - seedStart) / 1000).toFixed(2)}s`);
    console.log('3/4 Running VACUUM ANALYZE on clients and duplicate_candidates...');
    await prisma.$executeRawUnsafe(`VACUUM ANALYZE "clients";`);
    await prisma.$executeRawUnsafe(`VACUUM ANALYZE "duplicate_candidates";`);
  }

  const finalCounts = await prisma.$queryRawUnsafe(`
    SELECT
      version() AS pg_version,
      (SELECT COUNT(*)::bigint FROM "clients") AS total_clients,
      (SELECT COUNT(*)::bigint FROM "clients" WHERE "gn_id" = $1::uuid) AS target_gn_clients,
      pg_size_pretty(pg_total_relation_size('"clients"')) AS table_plus_indexes_size,
      pg_size_pretty(pg_indexes_size('"clients"')) AS indexes_size
  `, targetGnId);

  console.log('4/4 Running EXPLAIN (ANALYZE, BUFFERS) and timed pipeline trials...');
  console.log(`    Total rows: ${Number(finalCounts[0].total_clients).toLocaleString()}, Target GN rows: ${Number(finalCounts[0].target_gn_clients).toLocaleString()}, Size: ${finalCounts[0].table_plus_indexes_size}`);

  const q1Sql = `
    SELECT id, household_id, gn_id, name, name_norm, age, gender, phone_e164, whatsapp_e164
    FROM "clients"
    WHERE "deleted_at" IS NULL AND "duplicate_of" IS NULL AND "phone_e164" = ANY($1::varchar[])
    UNION
    SELECT id, household_id, gn_id, name, name_norm, age, gender, phone_e164, whatsapp_e164
    FROM "clients"
    WHERE "deleted_at" IS NULL AND "duplicate_of" IS NULL AND "whatsapp_e164" = ANY($1::varchar[])
  `;

  const q2Sql = `
    SELECT id, household_id, gn_id, name, name_norm, age, gender, phone_e164, whatsapp_e164
    FROM "clients"
    WHERE "household_id" = ANY($1::uuid[])
      AND "deleted_at" IS NULL
      AND "duplicate_of" IS NULL
  `;

  const q3Sql = `
    SELECT id, household_id, gn_id, name, name_norm, age, gender, phone_e164, whatsapp_e164
    FROM "clients"
    WHERE "gn_id" = $1::uuid
      AND "deleted_at" IS NULL
      AND "duplicate_of" IS NULL
      AND "name_norm" % $2::varchar
    LIMIT 50
  `;

  const q4Sql = `
    SELECT id, client_a, client_b, score, status, created_at
    FROM "duplicate_candidates"
    WHERE "status" = 'open'::duplicate_status
    ORDER BY "score" DESC, "created_at" DESC, "id" ASC
    LIMIT 50
  `;

  // Warm up buffer cache
  await prisma.$queryRawUnsafe(q1Sql, [targetPhone]);
  await prisma.$queryRawUnsafe(q2Sql, [targetHouseId]);
  await prisma.$queryRawUnsafe(q3Sql, targetGnId, targetNameNorm);
  await prisma.$queryRawUnsafe(q4Sql);

  const e1 = await runExplain('Q1: Phone / WhatsApp Indexed Lookup (5M rows)', q1Sql, [[targetPhone]]);
  const e2 = await runExplain('Q2: Same-Household Indexed Lookup (5M rows)', q2Sql, [[targetHouseId]]);
  const e3 = await runExplain('Q3: Same-GN pg_trgm Fuzzy Name Lookup (~30k rows in GN / 5M total)', q3Sql, [targetGnId, targetNameNorm]);
  const e4 = await runExplain('Q4: Duplicate Review Queue Keyset Query', q4Sql);

  // Measure 25 full end-to-end scoring pipeline runs (parallel Q1+Q2+Q3 + JS scoring)
  const timings = [];
  let lastCandidateCount = 0;
  for (let run = 0; run < 25; run++) {
    const start = performance.now();
    const [b1, b2, b3] = await Promise.all([
      prisma.$queryRawUnsafe(q1Sql, [targetPhone]),
      prisma.$queryRawUnsafe(q2Sql, [targetHouseId]),
      prisma.$queryRawUnsafe(q3Sql, targetGnId, targetNameNorm),
    ]);

    const pool = new Map();
    for (const r of [...b1, ...b2, ...b3]) {
      if (!pool.has(r.id)) {
        pool.set(r.id, {
          id: r.id,
          householdId: r.household_id,
          gnId: r.gn_id,
          name: r.name,
          nameNorm: r.name_norm,
          age: r.age,
          gender: r.gender,
          phone: r.phone_e164,
          whatsapp: r.whatsapp_e164,
        });
      }
    }
    const items = Array.from(pool.values());
    lastCandidateCount = items.length;
    if (items.length >= 2) {
      const target = items[0];
      for (let i = 1; i < items.length; i++) {
        scoreDuplicatePair(target, items[i]);
      }
    }
    timings.push(performance.now() - start);
  }

  timings.sort((a, b) => a - b);
  const p50 = percentile(timings, 0.5);
  const p95 = percentile(timings, 0.95);
  const minMs = timings[0];
  const maxMs = timings[timings.length - 1];

  const report = `# M6.5 5M-Row PostgreSQL Duplicate Detection Benchmark

- **Executed At:** ${new Date().toISOString()}
- **PostgreSQL Engine:** ${finalCounts[0].pg_version}
- **Total \`clients\` Rows:** ${Number(finalCounts[0].total_clients).toLocaleString()}
- **Target Dense Urban GN \`clients\` Rows:** ${Number(finalCounts[0].target_gn_clients).toLocaleString()}
- **Total Table + Indexes Size (\`clients\`):** ${finalCounts[0].table_plus_indexes_size} (Indexes: ${finalCounts[0].indexes_size})
- **Build Plan SLA Target (§11 M6.5):** \`< 300 ms\` using indexes

## End-to-End Post-Commit Candidate Lookup + JS Scoring Latency (25 warm runs)

Each run executes \`Q1\` (Phone/WhatsApp) + \`Q2\` (Same-Household) + \`Q3\` (Same-GN \`pg_trgm\`) concurrently against the **${Number(finalCounts[0].total_clients).toLocaleString()}-row** table (${lastCandidateCount} deduplicated candidates fetched & scored per run):

| Metric | Latency (ms) | Status (< 300 ms SLA) |
| :--- | ---: | :--- |
| Min | ${minMs.toFixed(2)} ms | PASS |
| p50 (Median) | ${p50.toFixed(2)} ms | PASS |
| **p95** | **${p95.toFixed(2)} ms** | **${p95 < 300 ? 'PASS' : 'FAIL'}** |
| Max | ${maxMs.toFixed(2)} ms | ${maxMs < 300 ? 'PASS' : 'FAIL'} |

---

## \`EXPLAIN (ANALYZE, BUFFERS)\` Query Plans

### ${e1.label} (${e1.elapsedMs.toFixed(2)} ms)
\`\`\`
${e1.plan}
\`\`\`

### ${e2.label} (${e2.elapsedMs.toFixed(2)} ms)
\`\`\`
${e2.plan}
\`\`\`

### ${e3.label} (${e3.elapsedMs.toFixed(2)} ms)
\`\`\`
${e3.plan}
\`\`\`

### ${e4.label} (${e4.elapsedMs.toFixed(2)} ms)
\`\`\`
${e4.plan}
\`\`\`
`;

  const outDir = path.resolve(__dirname, '../../docs/benchmarks');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'm6_5m_explain.md');
  fs.writeFileSync(outPath, report, 'utf8');

  console.log(`\nSaved M6.5 benchmark proof to ${outPath}`);
  console.log(`Timings (25 runs): min=${minMs.toFixed(2)}ms, p50=${p50.toFixed(2)}ms, p95=${p95.toFixed(2)}ms, max=${maxMs.toFixed(2)}ms`);
  console.log(`Total elapsed benchmark script time: ${((performance.now() - t0) / 1000).toFixed(1)}s\n`);

  if (p95 >= 300) {
    console.error(`SLA FAILED: p95=${p95.toFixed(2)}ms >= 300ms`);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
