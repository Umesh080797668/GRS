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

const { PrismaClient } = require(path.join(__dirname, '../apps/api/node_modules/@prisma/client'));

const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
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

async function run() {
  const filePath = path.join(__dirname, '../apps/api/prisma/migrations/07_account_assignments.sql');
  console.log('Reading migration file:', filePath);
  const sql = fs.readFileSync(filePath, 'utf8');
  const blocks = splitSqlBlocks(sql);
  console.log(`Executing ${blocks.length} statements...`);

  let executed = 0;
  for (const block of blocks) {
    try {
      await prisma.$executeRawUnsafe(block);
      executed++;
      console.log(`[${executed}/${blocks.length}] OK: ${block.slice(0, 60).replace(/\n/g, ' ')}...`);
    } catch (err) {
      console.error(`Error on block ${executed + 1}:`, block, err.message);
      throw err;
    }
  }
  console.log(`\n✅ Migration 07 applied successfully! (${executed}/${blocks.length} statements)`);
}

run()
  .catch((e) => {
    console.error('Migration 07 failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

