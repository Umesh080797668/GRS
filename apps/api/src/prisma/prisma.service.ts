import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });

/**
 * Normalizes the runtime Postgres connection string for serverless and Supavisor
 * environments so pooled deployments never exhaust Session-mode connections.
 */
export function normalizeRuntimeDatabaseUrl(
  rawUrl?: string,
  isServerless = Boolean(
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME,
  ),
): string | undefined {
  if (!rawUrl || !rawUrl.trim()) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return rawUrl;
  }

  const hostname = parsed.hostname.toLowerCase();
  const isSupabasePooler = hostname.endsWith('.pooler.supabase.com');

  // Supavisor port 5432 uses Session mode (pool_size: 15 globally) and fails
  // with EMAXCONNSESSION under serverless concurrency; port 6543 uses Transaction mode.
  if (
    isSupabasePooler &&
    (!parsed.port || parsed.port === '5432') &&
    process.env.PRISMA_ALLOW_SESSION_POOLER !== 'true'
  ) {
    parsed.port = '6543';
  }

  if (parsed.port === '6543' || isSupabasePooler) {
    parsed.searchParams.set('pgbouncer', 'true');
  }

  if (
    isServerless ||
    isSupabasePooler ||
    !parsed.searchParams.has('connection_limit')
  ) {
    parsed.searchParams.set('connection_limit', '1');
  }

  if (!parsed.searchParams.has('pool_timeout')) {
    parsed.searchParams.set('pool_timeout', '60');
  }

  return parsed.toString();
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
    const sessionUrl = normalizeRuntimeDatabaseUrl(dbUrl);

    super({
      datasources: sessionUrl ? { db: { url: sessionUrl } } : undefined,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    this.logger.log('Initializing Prisma database connection...');
    try {
      await this.$connect();
      this.logger.log('Database connected successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Deferred database connection: ${msg}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
