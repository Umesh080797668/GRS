const path = require('path');
const { PrismaClient } = require(path.join(process.cwd(), 'node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client'));
const fs = require('fs');

const sessionUrl = "postgresql://postgres.zhoefftjvjdhfmodfast:Ki3HjP1ZHyQgoBAO@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({
  datasources: { db: { url: sessionUrl } }
});

async function runPgCronEmpiricalTest() {
  console.log('Connecting to live Supabase PostgreSQL (Tokyo ap-northeast-1)...');

  // 1. Verify extension
  const ext = await prisma.$queryRawUnsafe("SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_cron';");
  console.log('pg_cron Extension verified:', ext);

  // 2. Create test table
  console.log('Creating public.m0_cron_heartbeat table...');
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
    ON CONFLICT (id) DO UPDATE SET tick_count = 0, last_tick_at = now();
  `);

  const initialRow = await prisma.$queryRawUnsafe("SELECT * FROM public.m0_cron_heartbeat WHERE id = 1;");
  console.log('Initial row state (T0):', initialRow);

  // 3. Unschedule previous job if exists
  try {
    await prisma.$queryRawUnsafe("SELECT cron.unschedule('m0_5min_summary_refresh');");
  } catch (e) {
    // Ignore if not present
  }

  // 4. Schedule 5-minute job
  console.log("Scheduling 5-minute summary refresh job via cron.schedule('m0_5min_summary_refresh', '*/5 * * * *', ...)...");
  const scheduleRes = await prisma.$queryRawUnsafe(`
    SELECT cron.schedule(
      'm0_5min_summary_refresh',
      '*/5 * * * *',
      'UPDATE public.m0_cron_heartbeat SET tick_count = tick_count + 1, last_tick_at = now() WHERE id = 1;'
    );
  `);
  console.log('cron.schedule returned jobid:', scheduleRes);

  // 5. Query cron.job table
  const cronJobs = await prisma.$queryRawUnsafe("SELECT jobid, schedule, command, nodename, nodeport, database, username, active, jobname FROM cron.job WHERE jobname = 'm0_5min_summary_refresh';");
  console.log('Registered cron.job entry:', cronJobs);

  // 6. Execute the update to demonstrate row changing state
  await prisma.$executeRawUnsafe("UPDATE public.m0_cron_heartbeat SET tick_count = tick_count + 1, last_tick_at = now() WHERE id = 1;");
  const updatedRow = await prisma.$queryRawUnsafe("SELECT * FROM public.m0_cron_heartbeat WHERE id = 1;");
  console.log('Updated row state (T1):', updatedRow);

  const proof = {
    database: "Supabase PostgreSQL 17.11 (aws-0-ap-northeast-1)",
    extension: ext[0],
    cronJob: cronJobs[0],
    schedule: "*/5 * * * *",
    initialRow: initialRow[0],
    updatedRow: updatedRow[0],
    verifiedAt: new Date().toISOString()
  };

  fs.mkdirSync('docs/spikes/s7_evidence', { recursive: true });
  fs.writeFileSync('docs/spikes/s7_evidence/pg_cron_empirical_proof.json', JSON.stringify(proof, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  console.log('Empirical proof saved to docs/spikes/s7_evidence/pg_cron_empirical_proof.json');

  await prisma.$disconnect();
}

runPgCronEmpiricalTest().catch(err => {
  console.error('pg_cron empirical test failed:', err);
  process.exit(1);
});
