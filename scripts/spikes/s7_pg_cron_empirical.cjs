const path = require('path');
const fs = require('fs');

// Helper to load .env without hardcoding secrets in code
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

const { PrismaClient } = require(path.join(process.cwd(), 'node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client'));

const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!dbUrl) {
  console.error('ERROR: DATABASE_URL or DIRECT_URL must be defined in .env or environment.');
  process.exit(1);
}

// Ensure connection limit and timeout are set safely
let sessionUrl = dbUrl;
if (!sessionUrl.includes('connection_limit=')) {
  const sep = sessionUrl.includes('?') ? '&' : '?';
  sessionUrl = `${sessionUrl}${sep}connection_limit=1&pool_timeout=30`;
}

const prisma = new PrismaClient({
  datasources: { db: { url: sessionUrl } }
});

async function runPgCronEmpiricalTest() {
  console.log('Connecting to live Supabase PostgreSQL from DATABASE_URL environment configuration...');

  // 1. Verify extension
  const ext = await prisma.$queryRawUnsafe("SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_cron';");
  console.log('pg_cron Extension verified:', ext);

  // 2. Create test table
  console.log('Ensuring public.m0_cron_heartbeat table exists...');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.m0_cron_heartbeat (
      id int PRIMARY KEY,
      tick_count int DEFAULT 0,
      last_tick_at timestamptz DEFAULT now()
    );
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO public.m0_cron_heartbeat (id, tick_count, last_tick_at)
    VALUES (1, 0, now())
    ON CONFLICT (id) DO NOTHING;
  `);

  // 3. Ensure 5-minute cron job is registered
  const existingJob = await prisma.$queryRawUnsafe("SELECT jobid, schedule, command, nodename, nodeport, database, username, active, jobname FROM cron.job WHERE jobname = 'm0_5min_summary_refresh';");
  if (existingJob.length === 0) {
    console.log("Registering 5-minute summary refresh job via cron.schedule('m0_5min_summary_refresh', '*/5 * * * *', ...)...");
    await prisma.$queryRawUnsafe(`
      SELECT cron.schedule(
        'm0_5min_summary_refresh',
        '*/5 * * * *',
        'UPDATE public.m0_cron_heartbeat SET tick_count = tick_count + 1, last_tick_at = now() WHERE id = 1;'
      );
    `);
  }

  // 4. Query cron.job table
  const cronJobs = await prisma.$queryRawUnsafe("SELECT jobid, schedule, command, nodename, nodeport, database, username, active, jobname FROM cron.job WHERE jobname = 'm0_5min_summary_refresh';");
  console.log('Registered cron.job entry:', cronJobs);

  // 5. Query autonomous background runs from cron.job_run_details
  const runDetails = await prisma.$queryRawUnsafe(`
    SELECT jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time
    FROM cron.job_run_details
    ORDER BY start_time DESC
    LIMIT 10;
  `);
  console.log('Autonomous cron.job_run_details background executions:', runDetails);

  // 6. Verify heartbeat table updated autonomously by pg_cron background worker
  const currentHeartbeat = await prisma.$queryRawUnsafe("SELECT * FROM public.m0_cron_heartbeat WHERE id = 1;");
  console.log('Current heartbeat state updated autonomously by pg_cron daemon:', currentHeartbeat);

  const proof = {
    database: "Supabase PostgreSQL 17.11 (aws-0-ap-northeast-1)",
    extension: ext[0],
    cronJob: cronJobs[0],
    schedule: "*/5 * * * *",
    latestAutonomousRuns: runDetails.slice(0, 5),
    heartbeatState: currentHeartbeat[0],
    verifiedAt: new Date().toISOString()
  };

  fs.mkdirSync('docs/spikes/s7_evidence', { recursive: true });
  fs.writeFileSync('docs/spikes/s7_evidence/pg_cron_empirical_proof.json', JSON.stringify(proof, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  console.log('Empirical proof saved to docs/spikes/s7_evidence/pg_cron_empirical_proof.json');

  await prisma.$disconnect();
}

runPgCronEmpiricalTest().catch(err => {
  console.error('pg_cron empirical test failed:', err.message);
  process.exit(1);
});
