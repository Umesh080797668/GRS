import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter?: number;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly prisma: PrismaService) { }

  /**
   * Evaluates rate limit against DB-backed storage (rate_limits table).
   * Executes a single atomic UPSERT query per key to eliminate window-reset race conditions
   * and reduce multi-read/write overhead to a single atomic roundtrip.
   * Fails open on database errors so database glitches never throttle legitimate users.
   */
  async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const now = new Date();
    const windowMs = windowSeconds * 1000;

    try {
      if (typeof this.prisma.$queryRawUnsafe === 'function') {
        const rows = await this.prisma.$queryRawUnsafe<
          Array<{ count: number | bigint; window_start: Date | string }>
        >(
          `INSERT INTO "rate_limits" ("id", "key", "window_start", "count")
           VALUES (gen_random_uuid(), $1, $2, 1)
           ON CONFLICT ("key") DO UPDATE
           SET
             count = CASE
               WHEN "rate_limits"."window_start" + ($3 * INTERVAL '1 second') < $2 THEN 1
               ELSE "rate_limits"."count" + 1
             END,
             window_start = CASE
               WHEN "rate_limits"."window_start" + ($3 * INTERVAL '1 second') < $2 THEN $2
               ELSE "rate_limits"."window_start"
             END
           RETURNING "count", "window_start";`,
          key,
          now,
          windowSeconds,
        );

        if (rows && rows.length > 0) {
          const count = Number(rows[0].count);
          const windowStart = new Date(rows[0].window_start);
          const elapsed = now.getTime() - windowStart.getTime();

          if (count > limit) {
            const retryAfter = Math.max(
              1,
              Math.ceil((windowMs - elapsed) / 1000),
            );
            return {
              allowed: false,
              limit,
              remaining: 0,
              retryAfter,
            };
          }

          return {
            allowed: true,
            limit,
            remaining: Math.max(0, limit - count),
          };
        }
      }

      // Default safe fallback if raw query returned empty rows
      return {
        allowed: true,
        limit,
        remaining: 1,
      };
    } catch (err: any) {
      this.logger.error(
        `Rate limit check error for key ${key}: ${err?.message || err}`,
        err?.stack,
      );
      // Fail-open on database errors so database glitches never throttle legitimate users
      return {
        allowed: true,
        limit,
        remaining: 1,
      };
    }
  }

  /**
   * Throws HTTP 429 Too Many Requests with Retry-After header.
   */
  throwThrottled(retryAfter: number): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'TOO_MANY_REQUESTS',
        message: `Too many requests. Please retry in ${retryAfter} seconds.`,
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
