import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  database: {
    status: 'up' | 'down';
    latencyMs: number;
  };
  memory: {
    rssMb: number;
    heapUsedMb: number;
  };
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) { }

  getHello(): string {
    return 'Global Research & Survey API (GRS)';
  }

  /**
   * Health check endpoint with DB round-trip measurement (Spike S1).
   */
  async checkHealth(): Promise<HealthCheckResponse> {
    const start = performance.now();
    let dbStatus: 'up' | 'down' = 'up';
    let latencyMs = 0;

    try {
      const pingQuery = this.prisma.$queryRaw`SELECT 1`;
      // Attach local rejection handler to avoid unhandled rejection if timeout triggers first
      pingQuery.catch(() => { });

      await Promise.race([
        pingQuery,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Database connection timed out')), 1000),
        ),
      ]);
      latencyMs = Math.round((performance.now() - start) * 10) / 10;
    } catch (err: any) {
      this.logger.warn(`Database round-trip failed: ${err.message || err}`);
      dbStatus = 'down';
      latencyMs = Math.round((performance.now() - start) * 10) / 10;
    }

    const mem = process.memoryUsage();

    return {
      status: dbStatus === 'up' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      database: {
        status: dbStatus,
        latencyMs,
      },
      memory: {
        rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      },
    };
  }
}
