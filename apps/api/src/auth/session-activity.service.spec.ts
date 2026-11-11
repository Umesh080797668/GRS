import { NotFoundException } from '@nestjs/common';
import {
  getColomboDayStart,
  normalizeClientType,
  SessionActivityService,
  sumMergedIntervalsSeconds,
} from './session-activity.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/scope/scope.types';

interface MockProfileRow {
  id: string;
  userCode: string;
  email: string | null;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  districtId: string | null;
  dsId: string | null;
  gnId: string | null;
  teamId: string | null;
  lastLoginAt: Date | null;
  lastActiveAt: Date | null;
  createdAt: Date;
}

interface MockSessionRow {
  id: string;
  profileId: string;
  clientType: string;
  deviceId: string | null;
  startedAt: Date;
  lastActiveAt: Date;
  endedAt: Date | null;
  endReason: string | null;
}

interface ProfileUpdateManyArgs {
  where: {
    id?: string;
    isActive?: boolean;
    OR?: Array<{ lastActiveAt?: null | { lt?: Date } }>;
  };
  data: { lastActiveAt?: Date };
}

interface SessionCondition {
  endedAt?: null | { gte?: Date };
  lastActiveAt?: { gte?: Date };
}

interface SessionFindManyArgs {
  where?: {
    profileId?: string | { in?: string[] };
    endedAt?: null;
    lastActiveAt?: { gte?: Date };
    startedAt?: { lte?: Date };
    OR?: SessionCondition[];
  };
  orderBy?:
    Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;
  distinct?: string[];
  take?: number;
}

interface SessionCreateArgs {
  data: {
    profileId: string;
    clientType: string;
    deviceId?: string | null;
    startedAt: Date;
    lastActiveAt: Date;
  };
}

interface SessionUpdateManyArgs {
  where: { id?: string; endedAt?: null };
  data: Partial<MockSessionRow>;
}

function createInMemoryPrisma(
  initialProfiles: MockProfileRow[] = [],
  initialSessions: MockSessionRow[] = [],
) {
  const profiles = initialProfiles.map((p) => ({ ...p }));
  const sessions = initialSessions.map((s) => ({ ...s }));
  let idSeq = 1;

  const prisma = {
    profile: {
      findMany: jest.fn(() => Promise.resolve(profiles.map((p) => ({ ...p })))),
      findUnique: jest.fn((args: { where?: { id?: string } }) => {
        const found = profiles.find((p) => p.id === args?.where?.id);
        return Promise.resolve(found ? { ...found } : null);
      }),
      updateMany: jest.fn((args: ProfileUpdateManyArgs) => {
        let count = 0;
        for (const p of profiles) {
          if (args.where.id && p.id !== args.where.id) continue;
          if (
            args.where.isActive !== undefined &&
            p.isActive !== args.where.isActive
          ) {
            continue;
          }
          if (args.where.OR) {
            const matchesOr = args.where.OR.some((cond) => {
              if (cond.lastActiveAt === null) return p.lastActiveAt === null;
              if (
                cond.lastActiveAt &&
                'lt' in cond.lastActiveAt &&
                cond.lastActiveAt.lt
              ) {
                return (
                  p.lastActiveAt !== null &&
                  p.lastActiveAt < cond.lastActiveAt.lt
                );
              }
              return false;
            });
            if (!matchesOr) continue;
          }
          if (args.data.lastActiveAt !== undefined) {
            p.lastActiveAt = args.data.lastActiveAt;
          }
          count++;
        }
        return Promise.resolve({ count });
      }),
    },
    userSession: {
      findMany: jest.fn((args: SessionFindManyArgs = {}) => {
        let rows = sessions.filter((s) => {
          const w = args.where;
          if (!w) return true;
          if (w.profileId) {
            if (
              typeof w.profileId === 'string' &&
              s.profileId !== w.profileId
            ) {
              return false;
            }
            if (
              typeof w.profileId === 'object' &&
              w.profileId.in &&
              !w.profileId.in.includes(s.profileId)
            ) {
              return false;
            }
          }
          if (w.endedAt === null && s.endedAt !== null) return false;
          if (w.lastActiveAt?.gte && s.lastActiveAt < w.lastActiveAt.gte) {
            return false;
          }
          if (w.startedAt?.lte && s.startedAt > w.startedAt.lte) return false;
          if (w.OR) {
            const matchesOr = w.OR.some((cond) => {
              if (
                cond.endedAt &&
                typeof cond.endedAt === 'object' &&
                cond.endedAt.gte
              ) {
                return s.endedAt !== null && s.endedAt >= cond.endedAt.gte;
              }
              if (cond.endedAt === null && cond.lastActiveAt?.gte) {
                return (
                  s.endedAt === null && s.lastActiveAt >= cond.lastActiveAt.gte
                );
              }
              return false;
            });
            if (!matchesOr) return false;
          }
          return true;
        });

        if (args.orderBy) {
          const orderList = Array.isArray(args.orderBy)
            ? args.orderBy
            : [args.orderBy];
          rows = [...rows].sort((a, b) => {
            for (const clause of orderList) {
              const [field, dir] = Object.entries(clause)[0];
              const aRaw = a[field as keyof MockSessionRow];
              const bRaw = b[field as keyof MockSessionRow];
              const av =
                aRaw instanceof Date ? aRaw.getTime() : String(aRaw ?? '');
              const bv =
                bRaw instanceof Date ? bRaw.getTime() : String(bRaw ?? '');
              if (av !== bv) {
                if (typeof av === 'number' && typeof bv === 'number') {
                  return dir === 'desc' ? bv - av : av - bv;
                }
                return dir === 'desc'
                  ? String(bv).localeCompare(String(av))
                  : String(av).localeCompare(String(bv));
              }
            }
            return 0;
          });
        }

        if (args.distinct?.includes('profileId')) {
          const seen = new Set<string>();
          rows = rows.filter((r) => {
            if (seen.has(r.profileId)) return false;
            seen.add(r.profileId);
            return true;
          });
        }

        if (args.take) {
          rows = rows.slice(0, args.take);
        }

        return Promise.resolve(rows.map((r) => ({ ...r })));
      }),
      create: jest.fn((args: SessionCreateArgs) => {
        const created: MockSessionRow = {
          id: `sess-${idSeq++}`,
          endedAt: null,
          endReason: null,
          deviceId: args.data.deviceId ?? null,
          profileId: args.data.profileId,
          clientType: args.data.clientType,
          startedAt: args.data.startedAt,
          lastActiveAt: args.data.lastActiveAt,
        };
        sessions.push(created);
        return Promise.resolve({ ...created });
      }),
      updateMany: jest.fn((args: SessionUpdateManyArgs) => {
        let count = 0;
        for (const s of sessions) {
          if (args.where.id && s.id !== args.where.id) continue;
          if (args.where.endedAt === null && s.endedAt !== null) continue;
          Object.assign(s, args.data);
          count++;
        }
        return Promise.resolve({ count });
      }),
    },
    district: {
      findMany: jest.fn(() =>
        Promise.resolve([{ id: 'dist-1', nameEn: 'Colombo' }]),
      ),
    },
    divisionalSecretariat: {
      findMany: jest.fn(() =>
        Promise.resolve([{ id: 'ds-1', nameEn: 'Thimbirigasyaya' }]),
      ),
    },
    gnDivision: {
      findMany: jest.fn(() =>
        Promise.resolve([{ id: 'gn-1', gnName: 'Narahenpita' }]),
      ),
    },
    team: {
      findMany: jest.fn(() => Promise.resolve([{ id: 'team-1', teamNo: 1 }])),
    },
  };

  return {
    prisma: prisma as unknown as PrismaService,
    profiles,
    sessions,
  };
}

describe('SessionActivityService helpers & lifecycle', () => {
  describe('normalizeClientType', () => {
    it('prioritizes explicit headers and distinguishes web vs mobile', () => {
      expect(
        normalizeClientType({ clientType: 'web', hasAppVersionHeader: true }),
      ).toBe('web');
      expect(normalizeClientType({ clientType: 'mobile' })).toBe('mobile');
      expect(normalizeClientType({ deviceId: 'mobile-android-1' })).toBe(
        'mobile',
      );
      expect(normalizeClientType({ userAgent: 'Dart/3.4 (dart:io)' })).toBe(
        'mobile',
      );
      expect(normalizeClientType({ hasAppVersionHeader: true })).toBe('mobile');
      expect(normalizeClientType({})).toBe('unknown');
    });
  });

  describe('Colombo day boundary & interval merging', () => {
    it('calculates Sri Lanka (UTC+05:30) midnight cleanly regardless of timezone', () => {
      const earlyMorningColombo = new Date('2026-11-11T01:15:00+05:30');
      expect(getColomboDayStart(earlyMorningColombo).toISOString()).toBe(
        '2026-11-10T18:30:00.000Z',
      );

      const lateNightColombo = new Date('2026-11-10T23:55:00+05:30');
      expect(getColomboDayStart(lateNightColombo).toISOString()).toBe(
        '2026-11-09T18:30:00.000Z',
      );
    });

    it('merges overlapping web and mobile sessions without double counting', () => {
      const t0 = new Date('2026-11-11T09:00:00+05:30').getTime();
      const m = (mins: number) => t0 + mins * 60_000;
      const seconds = sumMergedIntervalsSeconds([
        [m(0), m(30)],
        [m(15), m(45)],
        [m(60), m(70)],
      ]);
      expect(seconds).toBe(55 * 60);
    });
  });

  describe('Session transitions (login -> activity -> idle timeout -> logout)', () => {
    it('extends active session within 5m, closes stale session after >5m idle, and keeps web/mobile independent', async () => {
      const t0 = new Date('2026-11-11T09:00:00+05:30');
      const { prisma, profiles, sessions } = createInMemoryPrisma([
        {
          id: 'u1',
          userCode: 'GRS-SA-001',
          email: null,
          fullName: 'Super Admin',
          role: UserRole.super_admin,
          isActive: true,
          districtId: null,
          dsId: null,
          gnId: null,
          teamId: null,
          lastLoginAt: t0,
          lastActiveAt: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      ]);

      const service = new SessionActivityService(prisma);

      await service.recordLoginSession({
        profileId: 'u1',
        clientType: 'web',
        now: t0,
      });
      expect(sessions).toHaveLength(1);
      expect(profiles[0].lastActiveAt).toEqual(t0);

      const t2 = new Date(t0.getTime() + 2 * 60_000);
      await service.touchActivity({
        profileId: 'u1',
        clientType: 'web',
        now: t2,
        skipDebounce: true,
      });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].lastActiveAt).toEqual(t2);
      expect(sessions[0].endedAt).toBeNull();

      const t3 = new Date(t0.getTime() + 3 * 60_000);
      await service.recordLoginSession({
        profileId: 'u1',
        clientType: 'mobile',
        deviceId: 'mobile-pixel-8',
        now: t3,
      });
      expect(sessions).toHaveLength(2);
      expect(sessions[0].endedAt).toBeNull();
      expect(sessions[1].clientType).toBe('mobile');

      const t4 = new Date(t0.getTime() + 4 * 60_000);
      await service.endSessions({
        profileId: 'u1',
        reason: 'logout',
        clientType: 'web',
        now: t4,
      });
      expect(sessions[0].endedAt).toEqual(t4);
      expect(sessions[0].endReason).toBe('logout');
      expect(sessions[1].endedAt).toBeNull();

      const t13 = new Date(t0.getTime() + 13 * 60_000);
      await service.touchActivity({
        profileId: 'u1',
        clientType: 'mobile',
        deviceId: 'mobile-pixel-8',
        now: t13,
        skipDebounce: true,
      });
      expect(sessions).toHaveLength(3);
      expect(sessions[1].endedAt).toEqual(t3);
      expect(sessions[1].endReason).toBe('idle_timeout');
      expect(sessions[2].startedAt).toEqual(t13);
      expect(sessions[2].endedAt).toBeNull();
    });

    it('debounces rapid interceptor bursts within 15s unless skipDebounce is set', async () => {
      const t0 = new Date('2026-11-11T10:00:00+05:30');
      const { prisma, sessions } = createInMemoryPrisma([
        {
          id: 'u1',
          userCode: 'GRS-AD-001',
          email: null,
          fullName: 'Admin One',
          role: UserRole.admin,
          isActive: true,
          districtId: null,
          dsId: null,
          gnId: null,
          teamId: null,
          lastLoginAt: t0,
          lastActiveAt: t0,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      ]);

      const service = new SessionActivityService(prisma);
      await service.recordLoginSession({
        profileId: 'u1',
        clientType: 'web',
        now: t0,
      });

      const t5s = new Date(t0.getTime() + 5_000);
      await service.touchActivity({
        profileId: 'u1',
        clientType: 'web',
        now: t5s,
      });
      expect(sessions[0].lastActiveAt).toEqual(t0);

      const t20s = new Date(t0.getTime() + 20_000);
      await service.touchActivity({
        profileId: 'u1',
        clientType: 'web',
        now: t20s,
      });
      expect(sessions[0].lastActiveAt).toEqual(t20s);
    });
  });

  describe('Super Admin activity monitoring queries', () => {
    it('computes summary KPIs, status filters, sorting, and accurate durations', async () => {
      const now = new Date('2026-11-11T12:00:00+05:30');
      const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000);

      const { prisma } = createInMemoryPrisma(
        [
          {
            id: 'u-online',
            userCode: 'GRS-DC-001',
            email: null,
            fullName: 'Active Officer',
            role: UserRole.dc,
            isActive: true,
            districtId: 'dist-1',
            dsId: null,
            gnId: null,
            teamId: null,
            lastLoginAt: minsAgo(45),
            lastActiveAt: minsAgo(1),
            createdAt: new Date('2026-01-01T00:00:00Z'),
          },
          {
            id: 'u-idle',
            userCode: 'GRS-SDA-001',
            email: null,
            fullName: 'Idle Officer',
            role: UserRole.sda,
            isActive: true,
            districtId: 'dist-1',
            dsId: 'ds-1',
            gnId: null,
            teamId: null,
            lastLoginAt: minsAgo(40),
            lastActiveAt: minsAgo(12),
            createdAt: new Date('2026-01-02T00:00:00Z'),
          },
          {
            id: 'u-never',
            userCode: 'GRS-TM-001',
            email: null,
            fullName: 'New Enumerator',
            role: UserRole.team_member,
            isActive: true,
            districtId: 'dist-1',
            dsId: 'ds-1',
            gnId: 'gn-1',
            teamId: 'team-1',
            lastLoginAt: null,
            lastActiveAt: null,
            createdAt: new Date('2026-01-03T00:00:00Z'),
          },
        ],
        [
          {
            id: 's1',
            profileId: 'u-online',
            clientType: 'web',
            deviceId: null,
            startedAt: minsAgo(45),
            lastActiveAt: minsAgo(1),
            endedAt: null,
            endReason: null,
          },
          {
            id: 's2',
            profileId: 'u-online',
            clientType: 'mobile',
            deviceId: 'mobile-1',
            startedAt: minsAgo(20),
            lastActiveAt: minsAgo(2),
            endedAt: null,
            endReason: null,
          },
          {
            id: 's3',
            profileId: 'u-idle',
            clientType: 'web',
            deviceId: null,
            startedAt: minsAgo(40),
            lastActiveAt: minsAgo(12),
            endedAt: null,
            endReason: null,
          },
        ],
      );

      const service = new SessionActivityService(prisma);
      const res = await service.getAccountsActivity({}, now);

      expect(res.summary).toEqual({
        totalAccounts: 3,
        onlineNow: 1,
        onlineWeb: 1,
        onlineMobile: 1,
        offlinePreviouslyActive: 1,
        neverSignedIn: 1,
        activeToday: 2,
      });

      expect(res.items.map((i) => i.id)).toEqual([
        'u-online',
        'u-idle',
        'u-never',
      ]);

      const onlineItem = res.items[0];
      expect(onlineItem.status).toBe('online');
      expect(onlineItem.activeClients).toEqual(['web', 'mobile']);
      expect(onlineItem.currentSessionDurationSeconds).toBe(45 * 60);
      expect(onlineItem.todayActiveSeconds).toBe(45 * 60);
      expect(onlineItem.districtName).toBe('Colombo');

      const offlineItem = res.items[1];
      expect(offlineItem.status).toBe('offline');
      expect(offlineItem.lastActiveAt).toBe(minsAgo(12).toISOString());
      expect(offlineItem.currentSessionDurationSeconds).toBeNull();
      expect(offlineItem.lastSessionDurationSeconds).toBe(28 * 60);
      expect(offlineItem.todayActiveSeconds).toBe(28 * 60);

      const neverItem = res.items[2];
      expect(neverItem.status).toBe('never');
      expect(neverItem.lastActiveAt).toBeNull();
      expect(neverItem.todayActiveSeconds).toBe(0);

      const onlineOnly = await service.getAccountsActivity(
        { status: 'online', clientType: 'mobile' },
        now,
      );
      expect(onlineOnly.total).toBe(1);
      expect(onlineOnly.summary.totalAccounts).toBe(3);

      const detail = await service.getAccountActivityDetail('u-online', now);
      expect(detail.sessions).toHaveLength(2);
      expect(detail.account.status).toBe('online');

      await expect(
        service.getAccountActivityDetail('missing-id', now),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
