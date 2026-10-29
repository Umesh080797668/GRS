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

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
    let sessionUrl = dbUrl;
    if (sessionUrl && !sessionUrl.includes('connection_limit=')) {
      const sep = sessionUrl.includes('?') ? '&' : '?';
      sessionUrl = `${sessionUrl}${sep}connection_limit=1&pool_timeout=60`;
    }

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
    } catch (err: any) {
      this.logger.warn(`Deferred database connection: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
