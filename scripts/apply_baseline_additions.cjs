const fs = require('fs');
const path = require('path');

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
let sessionUrl = dbUrl;
if (!sessionUrl.includes('connection_limit=')) {
  const sep = sessionUrl.includes('?') ? '&' : '?';
  sessionUrl = `${sessionUrl}${sep}connection_limit=1&pool_timeout=60`;
}

const prisma = new PrismaClient({
  datasources: { db: { url: sessionUrl } },
});

async function main() {
  console.log('Applying extensions, indexes, constraints, role_rank, and 04_cron to live Supabase...');

  // 1. Extensions
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS "pg_trgm";`);
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
  console.log('Extensions pg_trgm & pgcrypto verified.');

  // 2. Live household partial unique index
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "households_gn_house_no_norm_live_uidx" ON "households"("gn_id", "house_no_norm") WHERE "deleted_at" IS NULL;`);
  console.log('Unique partial index households_gn_house_no_norm_live_uidx verified.');

  // 3. Constraints
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_age_check') THEN
        ALTER TABLE "clients" ADD CONSTRAINT "clients_age_check" CHECK ("age" >= 1 AND "age" <= 120);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_gender_check') THEN
        ALTER TABLE "clients" ADD CONSTRAINT "clients_gender_check" CHECK ("gender" IN ('F', 'M'));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_user_code_check') THEN
        ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_code_check" CHECK ("user_code" ~ '^GRS[0-9]{10}$');
      END IF;
    END $$;
  `);
  console.log('CHECK constraints (age 1-120, gender, user_code regex) verified.');

  // 4. SQL role_rank()
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION public.role_rank(role_name text)
    RETURNS integer AS $$
    BEGIN
      RETURN CASE role_name
        WHEN 'super_admin' THEN 70
        WHEN 'admin' THEN 60
        WHEN 'cg' THEN 50
        WHEN 'dc' THEN 40
        WHEN 'sda' THEN 30
        WHEN 'cdc_secretary' THEN 20
        WHEN 'team_member' THEN 10
        WHEN 'national_admin' THEN 60
        WHEN 'district_coord' THEN 50
        WHEN 'sdo' THEN 40
        WHEN 'ds_admin' THEN 30
        WHEN 'enumerator' THEN 20
        WHEN 'call_center' THEN 10
        ELSE 0
      END;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);
  console.log('SQL role_rank() function verified.');

  // 5. 04_cron.sql
  const cronSql = fs.readFileSync('apps/api/prisma/migrations/04_cron.sql', 'utf8');
  const blocks = [];
  let current = '';
  let inDollarQuote = false;
  for (const line of cronSql.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') && !inDollarQuote) continue;
    if (line.includes('$$')) {
      const count = (line.match(/\$\$/g) || []).length;
      if (count % 2 !== 0) inDollarQuote = !inDollarQuote;
    }
    current += line + '\n';
    if (!inDollarQuote && trimmed.endsWith(';')) {
      if (current.trim().length > 0) blocks.push(current.trim());
      current = '';
    }
  }
  if (current.trim().length > 0) blocks.push(current.trim());

  for (const block of blocks) {
    await prisma.$executeRawUnsafe(block);
  }
  console.log('04_cron.sql applied successfully.');

  // Test SQL role_rank
  const rankRes = await prisma.$queryRawUnsafe(`SELECT public.role_rank('super_admin') as super_rank, public.role_rank('team_member') as tm_rank;`);
  console.log('role_rank query result:', rankRes);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Error applying additions:', e);
  await prisma.$disconnect();
  process.exit(1);
});
