import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter?: number;
}

@Injectable()
export class RateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluates rate limit against DB-backed storage (rate_limits table).
   * Returns allowed status and retry-after in seconds when throttled.
   */
  async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const now = new Date();
    const windowMs = windowSeconds * 1000;

    try {
      const existing = await this.prisma.rateLimit.findUnique({
        where: { key },
      });

      if (!existing) {
        await this.prisma.rateLimit.create({
          data: {
            key,
            windowStart: now,
            count: 1,
          },
        });
        return {
          allowed: true,
          limit,
          remaining: limit - 1,
        };
      }

      const elapsed = now.getTime() - existing.windowStart.getTime();

      // Window expired, reset window
      if (elapsed > windowMs) {
        await this.prisma.rateLimit.update({
          where: { key },
          data: {
            windowStart: now,
            count: 1,
          },
        });
        return {
          allowed: true,
          limit,
          remaining: limit - 1,
        };
      }

      // Limit reached
      if (existing.count >= limit) {
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

      // Increment count
      await this.prisma.rateLimit.update({
        where: { key },
        data: {
          count: { increment: 1 },
        },
      });

      return {
        allowed: true,
        limit,
        remaining: limit - (existing.count + 1),
      };
    } catch {
      // In event of DB hiccup during rate limiting, default to allowed to prevent total outage
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
