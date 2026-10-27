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

function splitSqlBlocks(sql) {
  const blocks = [];
  let current = '';
  let inDollarQuote = false;

  for (const line of sql.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') && !inDollarQuote) {
      continue;
    }

    if (line.includes('$$')) {
      const count = (line.match(/\$\$/g) || []).length;
      if (count % 2 !== 0) {
        inDollarQuote = !inDollarQuote;
      }
    }

    current += line + '\n';

    if (!inDollarQuote && trimmed.endsWith(';')) {
      if (current.trim().length > 0) {
        blocks.push(current.trim());
      }
      current = '';
    }
  }
  if (current.trim().length > 0) {
    blocks.push(current.trim());
  }
  return blocks;
}

async function applySqlFile(filePath) {
  const baseName = path.basename(filePath);
  console.log(`\n--- Applying ${baseName} to Supabase PostgreSQL ---`);
  const sql = fs.readFileSync(filePath, 'utf-8');
  const blocks = splitSqlBlocks(sql);
  console.log(`Executing ${blocks.length} statements from ${baseName}...`);

  let executed = 0;
  for (const block of blocks) {
    try {
      await prisma.$executeRawUnsafe(block);
      executed++;
    } catch (err) {
      console.error(`Error on statement ${executed + 1}:`, block.slice(0, 100).replace(/\n/g, ' '), '...', err.message);
      throw err;
    }
  }
  console.log(`✅ Finished ${baseName} (${executed}/${blocks.length} statements succeeded).`);
}

async function main() {
  const migrationsDir = path.join(__dirname, '../apps/api/prisma/migrations');

  // 1. Apply Migration 02 (RLS & RPC)
  await applySqlFile(path.join(migrationsDir, '02_rls_and_rpc.sql'));

  // 2. Apply Migration 03 (Database Triggers)
  await applySqlFile(path.join(migrationsDir, '03_triggers.sql'));

  // 3. Verify RLS status on all 23 tables
  console.log('\n--- Verifying Row Level Security Status across public tables ---');
  const rlsTables = await prisma.$queryRawUnsafe(`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `);

  let rlsEnabledCount = 0;
  for (const t of rlsTables) {
    if (t.rowsecurity) rlsEnabledCount++;
    console.log(`  - ${t.tablename}: rowsecurity = ${t.rowsecurity}`);
  }

  console.log(`\n✅ RLS Enabled on ${rlsEnabledCount} of ${rlsTables.length} tables in public schema!`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Migration failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
