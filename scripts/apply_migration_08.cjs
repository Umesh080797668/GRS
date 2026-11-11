const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.resolve(__dirname, '../apps/api/.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
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
  }
}
loadEnv();

const {
  PrismaClient,
} = require(path.join(__dirname, '../apps/api/node_modules/@prisma/client'));

const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
let sessionUrl = dbUrl;
if (sessionUrl && !sessionUrl.includes('connection_limit=')) {
  const sep = sessionUrl.includes('?') ? '&' : '?';
  sessionUrl = `${sessionUrl}${sep}connection_limit=1&pool_timeout=60`;
}

const prisma = new PrismaClient(
  sessionUrl ? { datasources: { db: { url: sessionUrl } } } : undefined,
);

async function run() {
  const filePath = path.join(
    __dirname,
    '../apps/api/prisma/migrations/08_gn_division_number_name_unique.sql',
  );
  console.log('Reading migration file:', filePath);
  const sql = fs.readFileSync(filePath, 'utf8');
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
    executed++;
    console.log(
      `[${executed}/${statements.length}] OK: ${stmt.replace(/\s+/g, ' ').slice(0, 70)}...`,
    );
  }
  console.log(
    `\n✅ Migration 08 applied successfully! (${executed}/${statements.length} statements)`,
  );
}

run()
  .catch((e) => {
    console.error('Migration 08 failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

