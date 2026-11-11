/**
 * Apply Migration 10 (user_sessions + profiles.last_active_at) to Postgres/Supabase.
 * Usage: node scripts/apply_migration_10.cjs
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../apps/api/.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let val = trimmed.slice(eqIndex + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

const {
  PrismaClient,
} = require(path.join(__dirname, '../apps/api/node_modules/@prisma/client'));

const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('Error: DIRECT_URL or DATABASE_URL must be set.');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

async function main() {
  const sqlPath = path.join(
    __dirname,
    '../apps/api/prisma/migrations/10_user_sessions_activity.sql',
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const statements = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`Executing ${statements.length} statements...`);
  let executed = 0;

  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt);
    executed += 1;
    console.log(
      `[${executed}/${statements.length}] OK: ${stmt.replace(/\s+/g, ' ').slice(0, 70)}...`,
    );
  }

  console.log(
    `\nMigration 10 applied successfully! (${executed}/${statements.length} statements)`,
  );
}

main()
  .catch((err) => {
    console.error('Migration 10 failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

