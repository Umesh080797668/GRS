import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, UserSession } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAccountActivityDto } from '../accounts/dto/list-account-activity.dto';

export type ActivityClientType = 'web' | 'mobile' | 'unknown';
export type ActivityStatus = 'online' | 'offline' | 'never';
export type SessionEndReason =
  'logout' | 'idle_timeout' | 'password_reset' | 'deactivated' | 'superseded';

export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const IDLE_TIMEOUT_SECONDS = IDLE_TIMEOUT_MS / 1000;
export const TOUCH_BURST_DEBOUNCE_MS = 15 * 1000;
export const COLOMBO_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export interface ClientMetadata {
  clientType?: string | null;
  deviceId?: string | null;
  hasAppVersionHeader?: boolean;
  userAgent?: string | null;
}

interface SessionLike {
  startedAt: Date;
  lastActiveAt: Date;
  endedAt: Date | null;
}

/**
 * Normalizes platform metadata from headers and device IDs into 'web', 'mobile', or 'unknown'.
 */
export function normalizeClientType(meta?: ClientMetadata): ActivityClientType {
  const raw = meta?.clientType?.trim().toLowerCase();
  if (raw === 'web') return 'web';
  if (raw === 'mobile') return 'mobile';

  const deviceId = meta?.deviceId?.trim().toLowerCase() ?? '';
  if (deviceId.startsWith('mobile')) return 'mobile';

  const ua = meta?.userAgent?.trim().toLowerCase() ?? '';
  if (ua.includes('dart/')) return 'mobile';

  if (meta?.hasAppVersionHeader) return 'mobile';

  return 'unknown';
}

/**
 * Truncates device ID to fit the database column constraint cleanly.
 */
export function normalizeDeviceId(deviceId?: string | null): string | null {
  const trimmed = deviceId?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 100);
}

/**
 * Returns the UTC timestamp corresponding to midnight (00:00:00) in Asia/Colombo (UTC+05:30).
 */
export function getColomboDayStart(now: Date = new Date()): Date {
  const colomboMs = now.getTime() + COLOMBO_OFFSET_MS;
  const colomboDate = new Date(colomboMs);
  const midnightColomboUtcMs = Date.UTC(
    colomboDate.getUTCFullYear(),
    colomboDate.getUTCMonth(),
    colomboDate.getUTCDate(),
  );
  return new Date(midnightColomboUtcMs - COLOMBO_OFFSET_MS);
}

/**
 * Resolves the effective end timestamp of a session interval.
 * Open non-idle sessions count up to `now`; idle or unclosed sessions stop at `lastActiveAt`.
 */
export function resolveEffectiveSessionEnd(
  session: SessionLike,
  now: Date,
  profileIsActive: boolean = true,
): Date {
  const startMs = session.startedAt.getTime();
  const nowMs = now.getTime();
  let endMs: number;

  if (session.endedAt) {
    endMs = Math.min(nowMs, session.endedAt.getTime());
  } else if (
    profileIsActive &&
    session.lastActiveAt.getTime() >= nowMs - IDLE_TIMEOUT_MS
  ) {
    endMs = nowMs;
  } else {
    endMs = Math.min(nowMs, session.lastActiveAt.getTime());
  }

  return new Date(Math.max(startMs, endMs));
}

/**
 * Computes session duration in whole seconds.
 */
export function computeSessionDurationSeconds(
  session: SessionLike,
  now: Date,
  profileIsActive: boolean = true,
): number {
  const end = resolveEffectiveSessionEnd(session, now, profileIsActive);
  return Math.max(
    0,
    Math.floor((end.getTime() - session.startedAt.getTime()) / 1000),
  );
}

/**
 * Merges overlapping `[startMs, endMs]` intervals and returns total covered seconds.
 */
export function sumMergedIntervalsSeconds(
  intervals: Array<[number, number]>,
): number {
  const valid = intervals
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);

  if (valid.length === 0) return 0;

  let totalMs = 0;
  let [curStart, curEnd] = valid[0];

  for (let i = 1; i < valid.length; i++) {
    const [nextStart, nextEnd] = valid[i];
    if (nextStart <= curEnd) {
      if (nextEnd > curEnd) curEnd = nextEnd;
    } else {
      totalMs += curEnd - curStart;
      curStart = nextStart;
      curEnd = nextEnd;
    }
  }
  totalMs += curEnd - curStart;

  return Math.max(0, Math.floor(totalMs / 1000));
}

@Injectable()
export class SessionActivityService {
  private readonly logger = new Logger(SessionActivityService.name);
  private readonly touchCache = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  private hasSessionModel(
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): boolean {
    return Boolean(
      (client as { userSession?: unknown } | undefined)?.userSession,
    );
  }

  private getBurstKey(
    profileId: string,
    clientType: ActivityClientType,
    deviceId: string | null,
  ): string {
    return `${profileId}:${clientType}:${deviceId ?? ''}`;
  }

  private clearProfileBurstCache(profileId: string): void {
    const prefix = `${profileId}:`;
    for (const key of this.touchCache.keys()) {
      if (key.startsWith(prefix)) {
        this.touchCache.delete(key);
      }
    }
  }

  private pruneBurstCache(nowMs: number): void {
    if (this.touchCache.size < 2000) return;
    for (const [key, touchedAt] of this.touchCache.entries()) {
      if (nowMs - touchedAt > TOUCH_BURST_DEBOUNCE_MS * 4) {
        this.touchCache.delete(key);
      }
    }
  }

  /**
   * Starts a fresh session on explicit sign-in and supersedes any open session for the same device/platform.
   */
  async recordLoginSession(params: {
    profileId: string;
    clientType?: string | null;
    deviceId?: string | null;
    now?: Date;
  }): Promise<void> {
    if (!this.hasSessionModel()) return;

    const now = params.now ?? new Date();
    const idleCutoff = new Date(now.getTime() - IDLE_TIMEOUT_MS);
    const clientType = normalizeClientType({ clientType: params.clientType });
    const deviceId = normalizeDeviceId(params.deviceId);

    this.touchCache.set(
      this.getBurstKey(params.profileId, clientType, deviceId),
      now.getTime(),
    );
    this.pruneBurstCache(now.getTime());

    await this.prisma.profile.updateMany({
      where: { id: params.profileId },
      data: { lastActiveAt: now },
    });

    const openSessions = await this.prisma.userSession.findMany({
      where: { profileId: params.profileId, endedAt: null },
      orderBy: { lastActiveAt: 'desc' },
    });

    for (const session of openSessions) {
      if (session.lastActiveAt < idleCutoff) {
        await this.prisma.userSession.updateMany({
          where: { id: session.id, endedAt: null },
          data: { endedAt: session.lastActiveAt, endReason: 'idle_timeout' },
        });
        continue;
      }

      const matchesDevice = Boolean(deviceId) && session.deviceId === deviceId;
      const matchesSamePlatform =
        clientType !== 'unknown' &&
        session.clientType === clientType &&
        (!deviceId || !session.deviceId || session.deviceId === deviceId);

      if (matchesDevice || matchesSamePlatform) {
        await this.prisma.userSession.updateMany({
          where: { id: session.id, endedAt: null },
          data: { endedAt: now, endReason: 'superseded' },
        });
      }
    }

    await this.prisma.userSession.create({
      data: {
        profileId: params.profileId,
        clientType,
        deviceId,
        startedAt: now,
        lastActiveAt: now,
      },
    });
  }

  /**
   * Extends an open session within the 5-minute idle threshold, or closes idle ones and opens a new session.
   */
  async touchActivity(params: {
    profileId: string;
    clientType?: string | null;
    deviceId?: string | null;
    now?: Date;
    skipDebounce?: boolean;
  }): Promise<Date> {
    const now = params.now ?? new Date();
    const nowMs = now.getTime();

    if (!this.hasSessionModel()) return now;

    const clientType = normalizeClientType({ clientType: params.clientType });
    const deviceId = normalizeDeviceId(params.deviceId);
    const cacheKey = this.getBurstKey(params.profileId, clientType, deviceId);

    if (!params.skipDebounce) {
      const lastTouched = this.touchCache.get(cacheKey);
      if (
        lastTouched !== undefined &&
        Math.abs(nowMs - lastTouched) < TOUCH_BURST_DEBOUNCE_MS
      ) {
        return now;
      }
    }

    this.touchCache.set(cacheKey, nowMs);
    this.pruneBurstCache(nowMs);

    const idleCutoff = new Date(nowMs - IDLE_TIMEOUT_MS);

    await this.prisma.profile.updateMany({
      where: {
        id: params.profileId,
        isActive: true,
        OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: now } }],
      },
      data: { lastActiveAt: now },
    });

    const openSessions = await this.prisma.userSession.findMany({
      where: { profileId: params.profileId, endedAt: null },
      orderBy: { lastActiveAt: 'desc' },
    });

    let matchedActiveSession: (typeof openSessions)[number] | null = null;

    for (const session of openSessions) {
      if (session.lastActiveAt < idleCutoff) {
        await this.prisma.userSession.updateMany({
          where: { id: session.id, endedAt: null },
          data: { endedAt: session.lastActiveAt, endReason: 'idle_timeout' },
        });
        continue;
      }

      if (!matchedActiveSession) {
        const deviceMatch = Boolean(deviceId) && session.deviceId === deviceId;
        const platformMatch =
          clientType !== 'unknown' &&
          session.clientType === clientType &&
          (!deviceId || !session.deviceId);
        const unknownPlatformFallback =
          clientType === 'unknown' || session.clientType === 'unknown';

        if (deviceMatch || platformMatch || unknownPlatformFallback) {
          matchedActiveSession = session;
        }
      }
    }

    if (matchedActiveSession) {
      const updateData: Prisma.UserSessionUpdateManyMutationInput = {
        lastActiveAt: now,
      };
      if (
        matchedActiveSession.clientType === 'unknown' &&
        clientType !== 'unknown'
      ) {
        updateData.clientType = clientType;
      }
      if (!matchedActiveSession.deviceId && deviceId) {
        updateData.deviceId = deviceId;
      }

      await this.prisma.userSession.updateMany({
        where: { id: matchedActiveSession.id, endedAt: null },
        data: updateData,
      });
    } else {
      await this.prisma.userSession.create({
        data: {
          profileId: params.profileId,
          clientType,
          deviceId,
          startedAt: now,
          lastActiveAt: now,
        },
      });
    }

    return now;
  }

  /**
   * Immediately closes active sessions for a user on logout, deactivation, or password reset/reissue.
   */
  async endSessions(
    params: {
      profileId: string;
      reason: Exclude<SessionEndReason, 'idle_timeout'>;
      clientType?: string | null;
      deviceId?: string | null;
      all?: boolean;
      now?: Date;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    if (!this.hasSessionModel(db)) return;

    const now = params.now ?? new Date();
    const idleCutoff = new Date(now.getTime() - IDLE_TIMEOUT_MS);
    const clientType = normalizeClientType({ clientType: params.clientType });
    const deviceId = normalizeDeviceId(params.deviceId);

    this.clearProfileBurstCache(params.profileId);

    if (params.reason === 'logout') {
      await db.profile.updateMany({
        where: {
          id: params.profileId,
          OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: now } }],
        },
        data: { lastActiveAt: now },
      });
    }

    const openSessions = await db.userSession.findMany({
      where: { profileId: params.profileId, endedAt: null },
    });

    for (const session of openSessions) {
      if (session.lastActiveAt < idleCutoff) {
        await db.userSession.updateMany({
          where: { id: session.id, endedAt: null },
          data: { endedAt: session.lastActiveAt, endReason: 'idle_timeout' },
        });
        continue;
      }

      let shouldClose = Boolean(params.all);
      if (!shouldClose) {
        if (deviceId) {
          shouldClose = session.deviceId === deviceId;
        } else if (clientType !== 'unknown') {
          shouldClose = session.clientType === clientType && !session.deviceId;
        } else {
          shouldClose = true;
        }
      }

      if (shouldClose) {
        await db.userSession.updateMany({
          where: { id: session.id, endedAt: null },
          data: { endedAt: now, endReason: params.reason },
        });
      }
    }
  }

  /**
   * Resolves district, DS division, GN division, and team display names for a set of profiles.
   */
  private async resolveAreaLookup(
    profiles: Array<{
      districtId: string | null;
      dsId: string | null;
      gnId: string | null;
      teamId: string | null;
    }>,
  ) {
    const districtIds = Array.from(
      new Set(profiles.map((p) => p.districtId).filter(Boolean) as string[]),
    );
    const dsIds = Array.from(
      new Set(profiles.map((p) => p.dsId).filter(Boolean) as string[]),
    );
    const gnIds = Array.from(
      new Set(profiles.map((p) => p.gnId).filter(Boolean) as string[]),
    );
    const teamIds = Array.from(
      new Set(profiles.map((p) => p.teamId).filter(Boolean) as string[]),
    );

    const [districts, dsDivisions, gnDivisions, teams] = await Promise.all([
      districtIds.length && this.prisma.district?.findMany
        ? this.prisma.district.findMany({
            where: { id: { in: districtIds } },
            select: { id: true, nameEn: true },
          })
        : Promise.resolve<Array<{ id: string; nameEn: string }>>([]),
      dsIds.length && this.prisma.divisionalSecretariat?.findMany
        ? this.prisma.divisionalSecretariat.findMany({
            where: { id: { in: dsIds } },
            select: { id: true, nameEn: true },
          })
        : Promise.resolve<Array<{ id: string; nameEn: string }>>([]),
      gnIds.length && this.prisma.gnDivision?.findMany
        ? this.prisma.gnDivision.findMany({
            where: { id: { in: gnIds } },
            select: { id: true, gnName: true },
          })
        : Promise.resolve<Array<{ id: string; gnName: string }>>([]),
      teamIds.length && this.prisma.team?.findMany
        ? this.prisma.team.findMany({
            where: { id: { in: teamIds } },
            select: { id: true, teamNo: true },
          })
        : Promise.resolve<Array<{ id: string; teamNo: number }>>([]),
    ]);

    return {
      districtMap: new Map(districts.map((d) => [d.id, d.nameEn])),
      dsMap: new Map(dsDivisions.map((d) => [d.id, d.nameEn])),
      gnMap: new Map(gnDivisions.map((g) => [g.id, g.gnName])),
      teamMap: new Map(teams.map((t) => [t.id, `Team ${t.teamNo}`])),
    };
  }

  /**
   * Lists user online/offline activity status, active durations, and national summary KPIs for Super Admin.
   */
  async getAccountsActivity(
    query: ListAccountActivityDto,
    now: Date = new Date(),
  ) {
    const idleCutoff = new Date(now.getTime() - IDLE_TIMEOUT_MS);
    const todayStart = getColomboDayStart(now);
    const page = query.page ?? 1;
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));

    const [profiles, openActiveSessions, todayDistinctSessions] =
      await Promise.all([
        this.prisma.profile.findMany({
          select: {
            id: true,
            userCode: true,
            email: true,
            fullName: true,
            role: true,
            isActive: true,
            districtId: true,
            dsId: true,
            gnId: true,
            teamId: true,
            lastLoginAt: true,
            lastActiveAt: true,
            createdAt: true,
          },
        }),
        this.hasSessionModel()
          ? this.prisma.userSession.findMany({
              where: {
                endedAt: null,
                lastActiveAt: { gte: idleCutoff },
              },
              select: {
                id: true,
                profileId: true,
                clientType: true,
                deviceId: true,
                startedAt: true,
                lastActiveAt: true,
              },
              orderBy: { startedAt: 'asc' },
            })
          : Promise.resolve<
              Array<{
                id: string;
                profileId: string;
                clientType: string;
                deviceId: string | null;
                startedAt: Date;
                lastActiveAt: Date;
              }>
            >([]),
        this.hasSessionModel()
          ? this.prisma.userSession.findMany({
              where: {
                OR: [
                  { endedAt: { gte: todayStart } },
                  { endedAt: null, lastActiveAt: { gte: todayStart } },
                ],
              },
              select: { profileId: true },
              distinct: ['profileId'],
            })
          : Promise.resolve<Array<{ profileId: string }>>([]),
      ]);

    const activeSessionsByProfile = new Map<
      string,
      Array<(typeof openActiveSessions)[number]>
    >();
    for (const s of openActiveSessions) {
      const list = activeSessionsByProfile.get(s.profileId) ?? [];
      list.push(s);
      activeSessionsByProfile.set(s.profileId, list);
    }

    const activeTodaySet = new Set(
      todayDistinctSessions.map((row) => row.profileId),
    );

    let onlineNowCount = 0;
    let onlineWebCount = 0;
    let onlineMobileCount = 0;
    let offlinePreviouslyActiveCount = 0;
    let neverSignedInCount = 0;
    let activeTodayCount = 0;

    // Optional lookup map when filtering by clientType across offline accounts
    let latestClientByProfile = new Map<string, ActivityClientType>();
    if (
      this.hasSessionModel() &&
      query.clientType &&
      query.clientType !== 'all'
    ) {
      const latestRows = await this.prisma.userSession.findMany({
        distinct: ['profileId'],
        orderBy: [{ lastActiveAt: 'desc' }, { startedAt: 'desc' }],
        select: { profileId: true, clientType: true },
      });
      latestClientByProfile = new Map(
        latestRows.map((row) => [
          row.profileId,
          normalizeClientType({ clientType: row.clientType }),
        ]),
      );
    }

    const searchNormalized = query.search?.trim().toLowerCase() ?? '';

    const evaluated = profiles.map((p) => {
      const activeList = p.isActive
        ? (activeSessionsByProfile.get(p.id) ?? [])
        : [];
      const isOnline = activeList.length > 0;
      const effectiveLastActive =
        activeList.length > 0
          ? new Date(
              Math.max(
                p.lastActiveAt?.getTime() ?? 0,
                ...activeList.map((s) => s.lastActiveAt.getTime()),
              ),
            )
          : (p.lastActiveAt ?? p.lastLoginAt ?? null);

      const status: ActivityStatus = isOnline
        ? 'online'
        : effectiveLastActive
          ? 'offline'
          : 'never';

      const activeClients = Array.from(
        new Set(
          activeList
            .map((s) => normalizeClientType({ clientType: s.clientType }))
            .filter((c) => c !== 'unknown'),
        ),
      );

      if (status === 'online') {
        onlineNowCount += 1;
        if (activeClients.includes('web')) onlineWebCount += 1;
        if (activeClients.includes('mobile')) onlineMobileCount += 1;
      } else if (status === 'offline') {
        offlinePreviouslyActiveCount += 1;
      } else {
        neverSignedInCount += 1;
      }

      if (
        isOnline ||
        activeTodaySet.has(p.id) ||
        (effectiveLastActive && effectiveLastActive >= todayStart)
      ) {
        activeTodayCount += 1;
      }

      return {
        profile: p,
        status,
        activeList,
        activeClients,
        effectiveLastActive,
      };
    });

    const filtered = evaluated.filter((item) => {
      if (
        query.status &&
        query.status !== 'all' &&
        item.status !== query.status
      ) {
        return false;
      }
      if (query.role && item.profile.role !== query.role) {
        return false;
      }
      if (query.clientType && query.clientType !== 'all') {
        const hasActiveClient = item.activeClients.includes(query.clientType);
        const latestClient = latestClientByProfile.get(item.profile.id);
        if (item.status === 'online') {
          if (!hasActiveClient) return false;
        } else if (latestClient !== query.clientType) {
          return false;
        }
      }
      if (searchNormalized) {
        const nameMatch = item.profile.fullName
          .toLowerCase()
          .includes(searchNormalized);
        const codeMatch = item.profile.userCode
          .toLowerCase()
          .includes(searchNormalized);
        const emailMatch = (item.profile.email ?? '')
          .toLowerCase()
          .includes(searchNormalized);
        if (!nameMatch && !codeMatch && !emailMatch) return false;
      }
      return true;
    });

    // Sort: Online now first -> Offline previously active -> Never signed in;
    // within each group sort by most recently active descending, then createdAt desc, id asc.
    const rankStatus = (s: ActivityStatus): number =>
      s === 'online' ? 0 : s === 'offline' ? 1 : 2;

    filtered.sort((a, b) => {
      const statusDiff = rankStatus(a.status) - rankStatus(b.status);
      if (statusDiff !== 0) return statusDiff;

      const aTime = a.effectiveLastActive?.getTime() ?? -1;
      const bTime = b.effectiveLastActive?.getTime() ?? -1;
      if (bTime !== aTime) return bTime - aTime;

      const createdDiff =
        b.profile.createdAt.getTime() - a.profile.createdAt.getTime();
      if (createdDiff !== 0) return createdDiff;

      return a.profile.id.localeCompare(b.profile.id);
    });

    const total = filtered.length;
    const startIdx = (page - 1) * limit;
    const paged = filtered.slice(startIdx, startIdx + limit);
    const pageProfileIds = paged.map((p) => p.profile.id);

    const [latestPageSessions, todayPageSessions, areas] = await Promise.all([
      pageProfileIds.length && this.hasSessionModel()
        ? this.prisma.userSession.findMany({
            where: { profileId: { in: pageProfileIds } },
            distinct: ['profileId'],
            orderBy: [{ lastActiveAt: 'desc' }, { startedAt: 'desc' }],
          })
        : Promise.resolve<UserSession[]>([]),
      pageProfileIds.length && this.hasSessionModel()
        ? this.prisma.userSession.findMany({
            where: {
              profileId: { in: pageProfileIds },
              startedAt: { lte: now },
              OR: [
                { endedAt: null, lastActiveAt: { gte: todayStart } },
                { endedAt: { gte: todayStart } },
              ],
            },
            orderBy: { startedAt: 'asc' },
          })
        : Promise.resolve<UserSession[]>([]),
      this.resolveAreaLookup(paged.map((item) => item.profile)),
    ]);

    const latestByProfile = new Map(
      latestPageSessions.map((s) => [s.profileId, s]),
    );
    const todaySessionsByProfile = new Map<string, typeof todayPageSessions>();
    for (const s of todayPageSessions) {
      const list = todaySessionsByProfile.get(s.profileId) ?? [];
      list.push(s);
      todaySessionsByProfile.set(s.profileId, list);
    }

    const items = paged.map((entry) => {
      const p = entry.profile;
      const latestSession = latestByProfile.get(p.id) ?? null;
      const todayList = todaySessionsByProfile.get(p.id) ?? [];

      const todayActiveSeconds = sumMergedIntervalsSeconds(
        todayList.map((s) => {
          const effEnd = resolveEffectiveSessionEnd(s, now, p.isActive);
          return [
            Math.max(s.startedAt.getTime(), todayStart.getTime()),
            Math.min(effEnd.getTime(), now.getTime()),
          ];
        }),
      );

      let currentSessionStartedAt: Date | null = null;
      let currentSessionDurationSeconds: number | null = null;

      if (entry.status === 'online' && entry.activeList.length > 0) {
        const earliestStartMs = Math.min(
          ...entry.activeList.map((s) => s.startedAt.getTime()),
        );
        currentSessionStartedAt = new Date(earliestStartMs);
        currentSessionDurationSeconds = Math.max(
          0,
          Math.floor((now.getTime() - earliestStartMs) / 1000),
        );
      }

      const lastSessionDurationSeconds = latestSession
        ? computeSessionDurationSeconds(latestSession, now, p.isActive)
        : null;

      const lastClientType: ActivityClientType | null = latestSession
        ? normalizeClientType({ clientType: latestSession.clientType })
        : (entry.activeClients[0] ?? null);

      return {
        id: p.id,
        userCode: p.userCode,
        email: p.email,
        fullName: p.fullName,
        role: p.role,
        isActive: p.isActive,
        districtName: p.districtId
          ? (areas.districtMap.get(p.districtId) ?? null)
          : null,
        dsName: p.dsId ? (areas.dsMap.get(p.dsId) ?? null) : null,
        gnName: p.gnId ? (areas.gnMap.get(p.gnId) ?? null) : null,
        teamName: p.teamId ? (areas.teamMap.get(p.teamId) ?? null) : null,
        status: entry.status,
        activeClients: entry.activeClients,
        lastClientType,
        lastLoginAt: p.lastLoginAt?.toISOString() ?? null,
        lastActiveAt: entry.effectiveLastActive?.toISOString() ?? null,
        currentSessionStartedAt: currentSessionStartedAt?.toISOString() ?? null,
        currentSessionDurationSeconds,
        lastSessionStartedAt: latestSession?.startedAt.toISOString() ?? null,
        lastSessionEndedAt: latestSession
          ? resolveEffectiveSessionEnd(
              latestSession,
              now,
              p.isActive,
            ).toISOString()
          : null,
        lastSessionDurationSeconds,
        todayActiveSeconds,
      };
    });

    return {
      generatedAt: now.toISOString(),
      idleTimeoutSeconds: IDLE_TIMEOUT_SECONDS,
      summary: {
        totalAccounts: profiles.length,
        onlineNow: onlineNowCount,
        onlineWeb: onlineWebCount,
        onlineMobile: onlineMobileCount,
        offlinePreviouslyActive: offlinePreviouslyActiveCount,
        neverSignedIn: neverSignedInCount,
        activeToday: activeTodayCount,
      },
      items,
      total,
      page,
      limit,
    };
  }

  /**
   * Returns detailed session history (last 50 sessions) and summary metrics for a single user.
   */
  async getAccountActivityDetail(profileId: string, now: Date = new Date()) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        userCode: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        districtId: true,
        dsId: true,
        gnId: true,
        teamId: true,
        lastLoginAt: true,
        lastActiveAt: true,
        createdAt: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Account not found');
    }

    const idleCutoff = new Date(now.getTime() - IDLE_TIMEOUT_MS);
    const todayStart = getColomboDayStart(now);

    const [sessions, todaySessions, areas] = await Promise.all([
      this.hasSessionModel()
        ? this.prisma.userSession.findMany({
            where: { profileId: profile.id },
            orderBy: { startedAt: 'desc' },
            take: 50,
          })
        : Promise.resolve<UserSession[]>([]),
      this.hasSessionModel()
        ? this.prisma.userSession.findMany({
            where: {
              profileId: profile.id,
              startedAt: { lte: now },
              OR: [
                { endedAt: null, lastActiveAt: { gte: todayStart } },
                { endedAt: { gte: todayStart } },
              ],
            },
            orderBy: { startedAt: 'asc' },
          })
        : Promise.resolve<UserSession[]>([]),
      this.resolveAreaLookup([profile]),
    ]);

    const openActiveSessions = profile.isActive
      ? sessions.filter(
          (s) => s.endedAt === null && s.lastActiveAt >= idleCutoff,
        )
      : [];

    const isOnline = openActiveSessions.length > 0;
    const effectiveLastActive =
      openActiveSessions.length > 0
        ? new Date(
            Math.max(
              profile.lastActiveAt?.getTime() ?? 0,
              ...openActiveSessions.map((s) => s.lastActiveAt.getTime()),
            ),
          )
        : (profile.lastActiveAt ?? profile.lastLoginAt ?? null);

    const status: ActivityStatus = isOnline
      ? 'online'
      : effectiveLastActive
        ? 'offline'
        : 'never';

    const activeClients = Array.from(
      new Set(
        openActiveSessions
          .map((s) => normalizeClientType({ clientType: s.clientType }))
          .filter((c) => c !== 'unknown'),
      ),
    );

    const todayActiveSeconds = sumMergedIntervalsSeconds(
      todaySessions.map((s) => {
        const effEnd = resolveEffectiveSessionEnd(s, now, profile.isActive);
        return [
          Math.max(s.startedAt.getTime(), todayStart.getTime()),
          Math.min(effEnd.getTime(), now.getTime()),
        ];
      }),
    );

    const earliestActiveStartMs =
      openActiveSessions.length > 0
        ? Math.min(...openActiveSessions.map((s) => s.startedAt.getTime()))
        : null;

    const latestSession = sessions[0] ?? null;

    return {
      generatedAt: now.toISOString(),
      idleTimeoutSeconds: IDLE_TIMEOUT_SECONDS,
      account: {
        id: profile.id,
        userCode: profile.userCode,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role,
        isActive: profile.isActive,
        districtName: profile.districtId
          ? (areas.districtMap.get(profile.districtId) ?? null)
          : null,
        dsName: profile.dsId ? (areas.dsMap.get(profile.dsId) ?? null) : null,
        gnName: profile.gnId ? (areas.gnMap.get(profile.gnId) ?? null) : null,
        teamName: profile.teamId
          ? (areas.teamMap.get(profile.teamId) ?? null)
          : null,
        status,
        activeClients,
        lastLoginAt: profile.lastLoginAt?.toISOString() ?? null,
        lastActiveAt: effectiveLastActive?.toISOString() ?? null,
        currentSessionStartedAt:
          earliestActiveStartMs !== null
            ? new Date(earliestActiveStartMs).toISOString()
            : null,
        currentSessionDurationSeconds:
          earliestActiveStartMs !== null
            ? Math.max(
                0,
                Math.floor((now.getTime() - earliestActiveStartMs) / 1000),
              )
            : null,
        lastSessionDurationSeconds: latestSession
          ? computeSessionDurationSeconds(latestSession, now, profile.isActive)
          : null,
        todayActiveSeconds,
      },
      sessions: sessions.map((s) => {
        const sessionIsOnline =
          profile.isActive &&
          s.endedAt === null &&
          s.lastActiveAt >= idleCutoff;
        const effectiveEnd = resolveEffectiveSessionEnd(
          s,
          now,
          profile.isActive,
        );
        return {
          id: s.id,
          clientType: normalizeClientType({ clientType: s.clientType }),
          deviceId: s.deviceId,
          startedAt: s.startedAt.toISOString(),
          lastActiveAt: s.lastActiveAt.toISOString(),
          endedAt: s.endedAt?.toISOString() ?? null,
          effectiveEndedAt: sessionIsOnline ? null : effectiveEnd.toISOString(),
          endReason: s.endReason,
          isOnline: sessionIsOnline,
          durationSeconds: computeSessionDurationSeconds(
            s,
            now,
            profile.isActive,
          ),
        };
      }),
    };
  }
}
