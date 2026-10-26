import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigService } from './app-config.service';
import { VersionGateGuard } from './version-gate.guard';
import { RateLimitService } from './rate-limit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionContext, HttpException } from '@nestjs/common';

describe('AppConfigService & VersionGateGuard & RateLimiter (M1.8)', () => {
  let configService: AppConfigService;
  let versionGuard: VersionGateGuard;
  let rateLimitService: RateLimitService;

  let inMemorySettings: Record<string, any> = {};
  let inMemoryRateLimits: Record<string, any> = {};

  const mockPrisma = {
    appSetting: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const val = inMemorySettings[where.key];
        return Promise.resolve(val !== undefined ? { key: where.key, value: val } : null);
      }),
      upsert: jest.fn().mockImplementation(({ where, update, create }) => {
        inMemorySettings[where.key] = update.value ?? create.value;
        return Promise.resolve({ key: where.key, value: inMemorySettings[where.key] });
      }),
    },
    rateLimit: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const rl = inMemoryRateLimits[where.key];
        return Promise.resolve(rl ? { ...rl } : null);
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        inMemoryRateLimits[data.key] = { ...data };
        return Promise.resolve(inMemoryRateLimits[data.key]);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const existing = inMemoryRateLimits[where.key];
        if (existing) {
          if (data.count?.increment) {
            existing.count += data.count.increment;
          } else if (data.count !== undefined) {
            existing.count = data.count;
          }
          if (data.windowStart) {
            existing.windowStart = data.windowStart;
          }
          return Promise.resolve({ ...existing });
        }
        return Promise.resolve(null);
      }),
    },
  };

  beforeEach(async () => {
    inMemorySettings = {
      min_supported_version: '1.0.0',
      latest_version: '1.2.0',
      agent_can_edit_synced: false,
      sync_jitter_max_s: 15,
      sync_batch_max: 50,
      initial_password_ttl_days: 30,
      apk_download_url: 'https://storage.example.com/grs-release.apk',
    };
    inMemoryRateLimits = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppConfigService,
        VersionGateGuard,
        RateLimitService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    configService = module.get<AppConfigService>(AppConfigService);
    versionGuard = module.get<VersionGateGuard>(VersionGateGuard);
    rateLimitService = module.get<RateLimitService>(RateLimitService);
  });

  describe('/v1/config parameters', () => {
    it('returns authoritative configuration including sync pacing and version gates', async () => {
      const config = await configService.getConfig();

      expect(config.minSupportedVersion).toBe('1.0.0');
      expect(config.latestVersion).toBe('1.2.0');
      expect(config.agentCanEditSynced).toBe(false);
      expect(config.syncJitterMaxS).toBe(15);
      expect(config.syncBatchMax).toBe(50);
      expect(config.initialPasswordTtlDays).toBe(30);
      expect(config.apkDownloadUrl).toContain('.apk');
    });

    it('correctly compares semantic versions', () => {
      expect(configService.compareSemver('0.9.0', '1.0.0')).toBe(-1);
      expect(configService.compareSemver('1.0.0', '1.0.0')).toBe(0);
      expect(configService.compareSemver('1.0.1', '1.0.0')).toBe(1);
      expect(configService.compareSemver('1.2.0', '1.1.9')).toBe(1);
    });
  });

  describe('Version Gate (HTTP 426) (M1.8 Done when criterion)', () => {
    const createMockContext = (url: string, headers: Record<string, string>): ExecutionContext => {
      return {
        switchToHttp: () => ({
          getRequest: () => ({
            url,
            path: url,
            headers,
          }),
        }),
      } as unknown as ExecutionContext;
    };

    it('rejects outdated version with HTTP 426 Upgrade Required', async () => {
      const context = createMockContext('/v1/households', {
        'x-app-version': '0.9.5',
      });

      try {
        await versionGuard.canActivate(context);
        fail('Expected 426 Upgrade Required error');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(426);
        expect(err.getResponse().error).toBe('UPGRADE_REQUIRED');
        expect(err.getResponse().minSupportedVersion).toBe('1.0.0');
        expect(err.getResponse().apkDownloadUrl).toBeDefined();
      }
    });

    it('allows clients meeting or exceeding minimum supported version', async () => {
      const contextMin = createMockContext('/v1/households', {
        'x-app-version': '1.0.0',
      });
      const contextNew = createMockContext('/v1/households', {
        'x-app-version': '1.2.0',
      });

      expect(await versionGuard.canActivate(contextMin)).toBe(true);
      expect(await versionGuard.canActivate(contextNew)).toBe(true);
    });

    it('exempts /v1/config so outdated clients can always fetch upgrade information', async () => {
      const contextConfig = createMockContext('/v1/config', {
        'x-app-version': '0.1.0',
      });

      expect(await versionGuard.canActivate(contextConfig)).toBe(true);
    });
  });

  describe('DB-backed Rate Limiter & Retry-After (M1.8 Done when criterion)', () => {
    it('allows requests within limit and tracks count', async () => {
      const key = 'auth:login:ip-192.168.1.1';
      const result1 = await rateLimitService.checkRateLimit(key, 3, 60);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2);

      const result2 = await rateLimitService.checkRateLimit(key, 3, 60);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);
    });

    it('Done when criterion: throttled login returns Retry-After', async () => {
      const key = 'auth:login:ip-10.0.0.1';
      const limit = 2;
      const windowSeconds = 60;

      // Request 1: allowed
      await rateLimitService.checkRateLimit(key, limit, windowSeconds);
      // Request 2: allowed
      await rateLimitService.checkRateLimit(key, limit, windowSeconds);

      // Request 3: throttled
      const throttled = await rateLimitService.checkRateLimit(key, limit, windowSeconds);
      expect(throttled.allowed).toBe(false);
      expect(throttled.retryAfter).toBeGreaterThan(0);
      expect(throttled.retryAfter).toBeLessThanOrEqual(windowSeconds);

      // Throws HTTP 429
      try {
        rateLimitService.throwThrottled(throttled.retryAfter!);
        fail('Expected 429 Too Many Requests');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(429);
        expect(err.getResponse().error).toBe('TOO_MANY_REQUESTS');
        expect(err.getResponse().retryAfter).toBe(throttled.retryAfter);
      }
    });
  });
});
