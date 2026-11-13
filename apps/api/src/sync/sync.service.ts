import {
  Injectable,
  Logger,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LookupService } from '../lookups/lookup.service';
import { ScopeService } from '../common/scope/scope.service';
import { AppConfigService } from '../config/app-config.service';
import { GrsValidators } from '../common/validators/grs-validators';
import { DuplicatesService } from '../duplicates/duplicates.service';
import { UserRole, type ScopeContext } from '../common/scope/scope.types';
import {
  SyncPushDto,
  SyncPushResponse,
  SyncRecordPayloadDto,
  SyncRecordResultItem,
  SyncHouseholdResultItem,
} from './dto/sync-push.dto';
import { SyncChangesResponse } from './dto/sync-changes.dto';
import { normalizeDuplicateName } from '../duplicates/duplicate-scoring';

export interface AreaSyncResult {
  items: any[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
  lookups?: Record<string, any[]>;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupService: LookupService,
    private readonly scopeService: ScopeService,
    private readonly configService: AppConfigService,
    @Optional() private readonly duplicatesService?: DuplicatesService,
  ) { }

  /**
   * Normalizes a person name according to Build Plan §9:
   * NFC, lowercase, strip honorifics, remove punctuation and zero-width characters, sort name tokens.
   */
  static normalizeName(name: string): string {
    return normalizeDuplicateName(name);
  }

  /**
   * Deterministic SHA-256 hash of client core content for duplicate & retry idempotency.
   */
  static computeContentHash(data: {
    householdId: string;
    name: string;
    age: number;
    gender: string;
    address?: string | null;
    phoneE164?: string | null;
    whatsappE164?: string | null;
    highestEducation?: string | null;
    highestVocational?: string | null;
    interestedVocationalStream?: string | null;
    interestedJob?: string | null;
    isEpf?: boolean;
    isEtf?: boolean;
    isAswesuma?: boolean;
    isSamurdhi?: boolean;
    hasSpecialNeeds?: boolean;
    futureHopes?: string[];
    infoProvidedBy: string;
    infoProvidedByOther?: string | null;
    consentGiven: boolean;
  }): string {
    const canonical = {
      householdId: data.householdId,
      name: data.name.trim(),
      age: data.age,
      gender: data.gender,
      address: data.address?.trim() || '',
      phoneE164: data.phoneE164 || '',
      whatsappE164: data.whatsappE164 || '',
      highestEducation: data.highestEducation || '',
      highestVocational: data.highestVocational || '',
      interestedVocationalStream: data.interestedVocationalStream || '',
      interestedJob: data.interestedJob || '',
      isEpf: !!data.isEpf,
      isEtf: !!data.isEtf,
      isAswesuma: !!data.isAswesuma,
      isSamurdhi: !!data.isSamurdhi,
      hasSpecialNeeds: !!data.hasSpecialNeeds,
      futureHopes: (data.futureHopes || []).slice().sort(),
      infoProvidedBy: data.infoProvidedBy,
      infoProvidedByOther: data.infoProvidedByOther?.trim() || '',
      consentGiven: !!data.consentGiven,
    };
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(canonical))
      .digest('hex');
  }

  /**
   * Paged, resumable area download endpoint per DD-Campaign_Agent_Build_Plan.md §6.2.
   */
  async getAreaData(
    user: ScopeContext,
    cursor?: string,
    limit: number = 500,
    targetGnId?: string,
  ): Promise<AreaSyncResult> {
    if (!user || !user.role) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_SCOPE',
        message_key: 'errors.scope.missing_role',
      });
    }

    const where = this.scopeService.getHouseholdScopeFilter(user);

    if (targetGnId && targetGnId.trim()) {
      const cleanGnId = targetGnId.trim();
      if (user.role === UserRole.cdc_secretary) {
        let isAssigned = user.gnId === cleanGnId;
        let effectiveTeamId = user.teamId;
        if (!isAssigned) {
          const assignment = await this.prisma.profileAssignment.findFirst({
            where: {
              profileId: user.userId,
              gnId: cleanGnId,
              validTo: null,
            },
          });
          if (assignment) {
            isAssigned = true;
            if (assignment.teamId) effectiveTeamId = assignment.teamId;
          }
        }
        if (!isAssigned) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_GN',
            message: 'GN division is outside your assigned scope',
          });
        }
        if (effectiveTeamId) {
          where.teamId = effectiveTeamId;
          where.gnId = cleanGnId;
          if (where.OR) {
            where.OR = where.OR.map((cond: any) => ({
              ...cond,
              gnId: cleanGnId,
              teamId: effectiveTeamId,
            }));
          }
        } else {
          where.gnId = cleanGnId;
        }
      } else if (
        user.role === UserRole.super_admin ||
        user.role === UserRole.admin ||
        user.role === UserRole.cg
      ) {
        where.gnId = cleanGnId;
      } else if (user.role === UserRole.sda) {
        const gn = await this.prisma.gnDivision.findUnique({
          where: { id: cleanGnId },
        });
        if (!gn || gn.dsId !== user.dsId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DS',
            message: 'GN division is outside your assigned DS division',
          });
        }
        where.gnId = cleanGnId;
      } else if (user.role === UserRole.dc) {
        const gn = await this.prisma.gnDivision.findUnique({
          where: { id: cleanGnId },
          include: { ds: true },
        });
        if (!gn || gn.ds.districtId !== user.districtId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DISTRICT',
            message: 'GN division is outside your assigned district',
          });
        }
        where.gnId = cleanGnId;
      } else if (user.role === UserRole.team_member) {
        if (user.gnId && user.gnId !== cleanGnId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_GN',
            message: 'GN division is outside your assigned team scope',
          });
        }
      }
    }
    const take = Math.min(Math.max(1, limit), 500);

    const queryArgs: any = {
      where,
      orderBy: [{ serialNo: 'asc' }, { id: 'asc' }],
      take: take + 1,
    };

    if (cursor) {
      queryArgs.cursor = { id: cursor };
      queryArgs.skip = 1;
    }

    const [households, totalCount] = await Promise.all([
      this.prisma.household.findMany(queryArgs),
      this.prisma.household.count({ where }),
    ]);

    const hasMore = households.length > take;
    const items = hasMore ? households.slice(0, take) : households;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    let lookups: Record<string, any[]> | undefined;
    if (!cursor) {
      try {
        const catLookups = await this.lookupService.getCategorizedLookups();
        lookups = catLookups.categories;
      } catch (err: any) {
        this.logger.warn(
          `Failed to attach lookups to initial area sync: ${err.message}`,
        );
      }
    }

    return {
      items: items.map((h) => ({
        id: h.id,
        districtId: h.districtId,
        dsId: h.dsId,
        gnId: h.gnId,
        teamId: h.teamId,
        serialNo: h.serialNo,
        houseNo: h.houseNo,
        houseNoNorm: h.houseNoNorm,
        houseLeaderName: h.houseLeaderName,
        address: h.address,
        villageName: h.villageName,
        isEpf: h.isEpf,
        isEtf: h.isEtf,
        isAswesuma: h.isAswesuma,
        isSamurdhi: h.isSamurdhi,
        hasSpecialNeeds: h.hasSpecialNeeds,
        targetFemale: h.targetFemale,
        targetMale: h.targetMale,
        ageGroupMin: h.ageGroupMin,
        ageGroupMax: h.ageGroupMax,
        langSinhala: h.langSinhala,
        langTamil: h.langTamil,
        langEnglish: h.langEnglish,
        visitStatus: h.visitStatus ?? 'not_started',
        finishedAt: h.finishedAt ? h.finishedAt.toISOString() : null,
        finishedBy: h.finishedBy ?? null,
        version: h.version,
        createdAt: h.createdAt.toISOString(),
        updatedAt: h.updatedAt.toISOString(),
      })),
      nextCursor,
      hasMore,
      total: totalCount,
      lookups,
    };
  }

  /**
   * Incremental sync changes feed (delta) since cursor/timestamp per Build Plan §8.3 & Blueprint §6.2.
   * Returns household updates, soft-deletions, and server updates.
   */
  async getChanges(
    user: ScopeContext,
    since?: string,
    cursor?: string,
    limit: number = 500,
  ): Promise<SyncChangesResponse> {
    if (!user || !user.role) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_SCOPE',
        message_key: 'errors.scope.missing_role',
      });
    }

    // Take timestamp BEFORE running queries and subtract 5-second buffer (safe window)
    // to prevent concurrent transaction overlap or clock skew from skipping updates.
    // Client upserts are idempotent, so re-processing overlap is safe.
    const queryStartTime = new Date();
    const safeServerTime = new Date(
      queryStartTime.getTime() - 5000,
    ).toISOString();

    const whereScope = this.scopeService.getHouseholdScopeFilter(user);
    const sinceDate = since ? new Date(since) : new Date(0);

    // If caller belongs to a team (Level 4 or Level 5), active households must strictly match their teamId.
    // An unassigned house (teamId: null) or reassigned house must NOT be returned in updatedHouseholds.
    const householdFilter = user.teamId
      ? { teamId: user.teamId, deletedAt: null }
      : { ...whereScope, deletedAt: null };

    const clientFilter = this.scopeService.getClientScopeFilter(user);

    let parsedCursor: {
      isLegacy?: boolean;
      h?: { t: string; id: string };
      c?: { t: string; id: string };
      d?: { t: string; id: string };
      u?: { t: string; id: string };
    } = {};

    if (cursor) {
      try {
        let jsonStr = cursor;
        if (!cursor.startsWith('{')) {
          try {
            jsonStr = Buffer.from(cursor, 'base64url').toString('utf8');
          } catch (_) {
            jsonStr = cursor;
          }
        }
        if (jsonStr.startsWith('{')) {
          parsedCursor = JSON.parse(jsonStr);
        } else if (cursor.includes('_')) {
          const [t, id] = cursor.split('_');
          parsedCursor = { h: { t, id } };
        } else {
          parsedCursor = { isLegacy: true };
        }
      } catch (_) {
        parsedCursor = { isLegacy: true };
      }
    }

    const take = limit && limit > 0 ? limit : 500;

    // Helper for composite keyset (timestamp, id)
    const buildKeysetFilter = (
      baseWhere: any,
      timestampField: string,
      cursorObj?: { t: string; id: string },
    ) => {
      if (cursorObj?.t && cursorObj?.id) {
        const cursorTime = new Date(cursorObj.t);
        return {
          AND: [
            baseWhere,
            {
              OR: [
                { [timestampField]: { gt: cursorTime } },
                { [timestampField]: cursorTime, id: { gt: cursorObj.id } },
              ],
            },
          ],
        };
      }
      return {
        ...baseWhere,
        [timestampField]: { gt: sinceDate },
      };
    };

    const householdQueryArgs: any = {
      where: parsedCursor.h
        ? buildKeysetFilter(householdFilter, 'updatedAt', parsedCursor.h)
        : {
          ...householdFilter,
          updatedAt: { gt: sinceDate },
        },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: take + 1,
    };
    if (parsedCursor.isLegacy && cursor) {
      householdQueryArgs.cursor = { id: cursor };
      householdQueryArgs.skip = 1;
    }

    const deletedQueryArgs: any = {
      where: buildKeysetFilter(whereScope, 'deletedAt', parsedCursor.d),
      select: {
        id: true,
        deletedAt: true,
        deletedReason: true,
      },
      orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
      take: take + 1,
    };

    const unassignedQueryArgs: any =
      user.teamId && this.prisma.householdUnassignment
        ? {
          where: buildKeysetFilter(
            { teamId: user.teamId },
            'unassignedAt',
            parsedCursor.u,
          ),
          select: {
            id: true,
            householdId: true,
            unassignedAt: true,
          },
          orderBy: [{ unassignedAt: 'asc' }, { id: 'asc' }],
          take: take + 1,
        }
        : null;

    const clientQueryArgs: any = {
      where: buildKeysetFilter(clientFilter, 'updatedAt', parsedCursor.c),
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: take + 1,
    };

    const [
      rawUpdatedHouseholds,
      rawDeletedHouseholds,
      rawUnassignedFromTeam,
      rawUpdatedClients,
    ] = await Promise.all([
      this.prisma.household.findMany(householdQueryArgs),
      this.prisma.household.findMany(deletedQueryArgs),
      unassignedQueryArgs
        ? this.prisma.householdUnassignment.findMany(unassignedQueryArgs)
        : Promise.resolve([]),
      this.prisma.client.findMany(clientQueryArgs),
    ]);

    const hasMoreHouseholds = rawUpdatedHouseholds.length > take;
    const updatedHouseholds = hasMoreHouseholds
      ? rawUpdatedHouseholds.slice(0, take)
      : rawUpdatedHouseholds;

    const hasMoreDeleted = rawDeletedHouseholds.length > take;
    const deletedHouseholds = hasMoreDeleted
      ? rawDeletedHouseholds.slice(0, take)
      : rawDeletedHouseholds;

    const hasMoreUnassigned = rawUnassignedFromTeam.length > take;
    const unassignedFromTeam = hasMoreUnassigned
      ? rawUnassignedFromTeam.slice(0, take)
      : rawUnassignedFromTeam;

    const hasMoreClients = rawUpdatedClients.length > take;
    const updatedClients = hasMoreClients
      ? rawUpdatedClients.slice(0, take)
      : rawUpdatedClients;

    const hasMore =
      hasMoreHouseholds ||
      hasMoreDeleted ||
      hasMoreUnassigned ||
      hasMoreClients;

    let nextCursor: string | null = null;
    if (hasMore) {
      const lastH = updatedHouseholds[updatedHouseholds.length - 1];
      const lastD = deletedHouseholds[deletedHouseholds.length - 1];
      const lastU = unassignedFromTeam[unassignedFromTeam.length - 1];
      const lastC = updatedClients[updatedClients.length - 1];

      const compositeObj: any = {};
      if (lastH) {
        compositeObj.h = {
          t: lastH.updatedAt.toISOString(),
          id: lastH.id,
        };
      } else if (parsedCursor.h) {
        compositeObj.h = parsedCursor.h;
      }

      if (lastD) {
        compositeObj.d = {
          t: lastD.deletedAt!.toISOString(),
          id: lastD.id,
        };
      } else if (parsedCursor.d) {
        compositeObj.d = parsedCursor.d;
      }

      if (lastU) {
        compositeObj.u = {
          t: lastU.unassignedAt.toISOString(),
          id: lastU.id,
        };
      } else if (parsedCursor.u) {
        compositeObj.u = parsedCursor.u;
      }

      if (lastC) {
        compositeObj.c = {
          t: lastC.updatedAt.toISOString(),
          id: lastC.id,
        };
      } else if (parsedCursor.c) {
        compositeObj.c = parsedCursor.c;
      }

      nextCursor = Buffer.from(JSON.stringify(compositeObj)).toString(
        'base64url',
      );
    }

    // Check which unassigned houses are currently assigned to the team (re-claimed)
    const currentlyOnTeamIds = new Set<string>();
    if (user.teamId && unassignedFromTeam.length > 0) {
      const activeOnTeam = await this.prisma.household.findMany({
        where: {
          id: { in: unassignedFromTeam.map((u) => u.householdId) },
          teamId: user.teamId,
          deletedAt: null,
        },
        select: { id: true },
      });
      for (const h of activeOnTeam) {
        currentlyOnTeamIds.add(h.id);
      }
    }

    const deletedMap = new Map<
      string,
      { id: string; deletedAt: string; deletedReason?: string | null }
    >();

    for (const d of deletedHouseholds) {
      deletedMap.set(d.id, {
        id: d.id,
        deletedAt: d.deletedAt!.toISOString(),
        deletedReason: d.deletedReason,
      });
    }

    for (const u of unassignedFromTeam) {
      // Drop unassignments for houses currently on the team
      if (currentlyOnTeamIds.has(u.householdId)) {
        continue;
      }
      if (!deletedMap.has(u.householdId)) {
        deletedMap.set(u.householdId, {
          id: u.householdId,
          deletedAt: u.unassignedAt.toISOString(),
          deletedReason: 'unassigned_from_team',
        });
      }
    }

    // Defensive check: A house in updatedHouseholds must never be in deletedHouseholds
    for (const h of updatedHouseholds) {
      deletedMap.delete(h.id);
    }

    return {
      serverTime: safeServerTime,
      households: updatedHouseholds.map((h) => ({
        id: h.id,
        districtId: h.districtId,
        dsId: h.dsId,
        gnId: h.gnId,
        teamId: h.teamId,
        serialNo: h.serialNo,
        houseNo: h.houseNo,
        houseNoNorm: h.houseNoNorm,
        houseLeaderName: h.houseLeaderName,
        address: h.address,
        villageName: h.villageName,
        isEpf: h.isEpf,
        isEtf: h.isEtf,
        isAswesuma: h.isAswesuma,
        isSamurdhi: h.isSamurdhi,
        hasSpecialNeeds: h.hasSpecialNeeds,
        targetFemale: h.targetFemale,
        targetMale: h.targetMale,
        ageGroupMin: h.ageGroupMin,
        ageGroupMax: h.ageGroupMax,
        langSinhala: h.langSinhala,
        langTamil: h.langTamil,
        langEnglish: h.langEnglish,
        visitStatus: h.visitStatus ?? 'not_started',
        finishedAt: h.finishedAt ? h.finishedAt.toISOString() : null,
        finishedBy: h.finishedBy ?? null,
        version: h.version,
        createdAt: h.createdAt.toISOString(),
        updatedAt: h.updatedAt.toISOString(),
      })),
      deletedHouseholds: Array.from(deletedMap.values()),
      clients: updatedClients.map((c) => ({
        id: c.id,
        householdId: c.householdId,
        name: c.name,
        nameNorm: c.nameNorm,
        age: c.age,
        gender: c.gender,
        address: c.address,
        phoneRaw: c.phoneRaw,
        phoneE164: c.phoneE164,
        whatsappRaw: c.whatsappRaw,
        whatsappE164: c.whatsappE164,
        highestEducation: c.highestEducation,
        highestVocational: c.highestVocational,
        interestedVocationalStream: c.interestedVocationalStream,
        interestedJob: c.interestedJob,
        isEpf: c.isEpf,
        isEtf: c.isEtf,
        isAswesuma: c.isAswesuma,
        isSamurdhi: c.isSamurdhi,
        hasSpecialNeeds: c.hasSpecialNeeds,
        futureHopes: c.futureHopes,
        infoProvidedBy: c.infoProvidedBy,
        infoProvidedByOther: c.infoProvidedByOther,
        consentGiven: c.consentGiven,
        consentAt: c.consentAt?.toISOString(),
        serverVersion: c.serverVersion,
        contentHash: c.contentHash,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      nextCursor,
      hasMore,
    };
  }

  /**
   * Bulk upsert client survey records (POST /sync/push) per Build Plan §8.3.
   * Invariants:
   * 1. Validate every record in code against shared rules (Appendix A vectors).
   * 2. Query 1: Load existing client rows.
   * 3. Query 2: Load households for scope & soft-deletion checks.
   * 4. Query 3: Execute single bulk SQL statement with ON CONFLICT DO UPDATE and RETURNING.
   * 5. Total database queries <= 3 for a 50-record batch.
   */
  async pushRecords(
    user: ScopeContext,
    dto: SyncPushDto,
  ): Promise<SyncPushResponse> {
    if (!user || !user.role || !user.userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_SCOPE',
        message_key: 'errors.scope.missing_role',
      });
    }

    const finishedHouseholdsResults: SyncHouseholdResultItem[] = [];

    // Query all actively assigned GN divisions and teams for Level 4 write permissions
    const assignedGns = new Set<string>();
    const assignedTeams = new Set<string>();
    if (user.role === UserRole.cdc_secretary) {
      if (user.gnId) assignedGns.add(user.gnId);
      if (user.teamId) assignedTeams.add(user.teamId);
      try {
        const assignments = await this.prisma.profileAssignment.findMany({
          where: { profileId: user.userId, validTo: null },
          select: { gnId: true, teamId: true },
        });
        for (const a of assignments) {
          if (a.gnId) assignedGns.add(a.gnId);
          if (a.teamId) assignedTeams.add(a.teamId);
        }
      } catch { }
    }

    if (dto.finishedHouseholdIds && dto.finishedHouseholdIds.length > 0) {
      const households = await this.prisma.household.findMany({
        where: {
          id: { in: dto.finishedHouseholdIds },
          deletedAt: null,
        },
      });

      const householdMap = new Map(households.map((h) => [h.id, h]));
      const toUpdateIds: string[] = [];

      for (const hid of dto.finishedHouseholdIds) {
        const household = householdMap.get(hid);
        if (!household) {
          finishedHouseholdsResults.push({
            id: hid,
            status: 'not_found',
            code: 'HOUSEHOLD_NOT_FOUND',
            message: 'Household not found or deleted',
          });
          continue;
        }

        // Scope check:
        // For Level 5 (team_member): strictly own-team only.
        // For Level 4 (cdc_secretary): accepts any assigned GN division or own team.
        if (user.role === UserRole.team_member) {
          if (
            !user.teamId ||
            !household.teamId ||
            household.teamId !== user.teamId
          ) {
            finishedHouseholdsResults.push({
              id: hid,
              status: 'forbidden',
              code: 'OUT_OF_SCOPE_TEAM',
              message: 'Household is not assigned to your team',
            });
            continue;
          }
        } else if (user.role === UserRole.cdc_secretary) {
          const matchesTeam =
            household.teamId && assignedTeams.has(household.teamId);
          if (!matchesTeam) {
            finishedHouseholdsResults.push({
              id: hid,
              status: 'forbidden',
              code: 'OUT_OF_SCOPE_TEAM',
              message: 'Household is not assigned to your team',
            });
            continue;
          }
        } else if (user.role === UserRole.sda) {
          if (user.dsId && household.dsId !== user.dsId) {
            finishedHouseholdsResults.push({
              id: hid,
              status: 'forbidden',
              code: 'OUT_OF_SCOPE_DS',
              message: 'Household is outside your division',
            });
            continue;
          }
        } else if (user.role === UserRole.dc) {
          if (user.districtId && household.districtId !== user.districtId) {
            finishedHouseholdsResults.push({
              id: hid,
              status: 'forbidden',
              code: 'OUT_OF_SCOPE_DISTRICT',
              message: 'Household is outside your district',
            });
            continue;
          }
        }

        // Idempotency safeguard: if already completed, don't re-dirty version, finishedAt, or stats!
        if (household.visitStatus === 'completed') {
          finishedHouseholdsResults.push({
            id: hid,
            status: 'already_finished',
          });
          continue;
        }

        toUpdateIds.push(hid);
      }

      if (toUpdateIds.length > 0) {
        const now = new Date();
        await this.prisma.household.updateMany({
          where: {
            id: { in: toUpdateIds },
            visitStatus: { not: 'completed' },
          },
          data: {
            visitStatus: 'completed',
            finishedAt: now,
            finishedBy: user.userId,
            version: { increment: 1 },
            updatedAt: now,
          },
        });

        if (user.teamId) {
          if (typeof (this.prisma as any).$executeRawUnsafe === 'function') {
            await (this.prisma as any).$executeRawUnsafe(
              `UPDATE teams SET stats_dirty_at = now() WHERE id = $1::uuid`,
              user.teamId,
            );
          } else if (
            typeof (this.prisma as any).$queryRawUnsafe === 'function'
          ) {
            await (this.prisma as any).$queryRawUnsafe(
              `UPDATE teams SET stats_dirty_at = now() WHERE id = $1::uuid`,
              user.teamId,
            );
          }
        }

        for (const hid of toUpdateIds) {
          finishedHouseholdsResults.push({
            id: hid,
            status: 'ok',
          });
        }
      }
    }

    if (!dto.records || dto.records.length === 0) {
      return {
        results: [],
        finishedHouseholds: finishedHouseholdsResults,
      };
    }

    const results: SyncRecordResultItem[] = new Array(dto.records.length);
    const validRecords: Array<{
      index: number;
      record: SyncRecordPayloadDto;
      normalized: {
        householdId: string;
        name: string;
        nameNorm: string;
        age: number;
        gender: string;
        address: string | null;
        phoneRaw: string | null;
        phoneE164: string | null;
        whatsappRaw: string | null;
        whatsappE164: string | null;
        highestEducation: string | null;
        highestVocational: string | null;
        interestedVocationalStream: string | null;
        interestedJob: string | null;
        isEpf: boolean;
        isEtf: boolean;
        isAswesuma: boolean;
        isSamurdhi: boolean;
        hasSpecialNeeds: boolean;
        futureHopes: string[];
        infoProvidedBy: string;
        infoProvidedByOther: string | null;
        consentGiven: boolean;
        consentAt: Date;
        consentVersion: string;
        clientUpdatedAt: Date;
        contentHash: string;
      };
    }> = [];

    // --- STEP 1: Code-level validation across all records ---
    const activeLookups =
      await this.lookupService.getActiveLookupCodesByCategory();
    const currentConsentVersion = await this.configService.getConsentVersion();

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validInfoProvidedBy = new Set([
      'self',
      'mother',
      'father',
      'sister',
      'other',
    ]);

    const seenClientIds = new Set<string>();

    for (let i = 0; i < dto.records.length; i++) {
      const record = dto.records[i];
      if (!record.id || !uuidRegex.test(record.id)) {
        results[i] = {
          id: record.id || 'unknown',
          status: 'rejected',
          code: 'INVALID_CLIENT_ID',
          message: 'Client ID must be a valid UUID',
        };
        continue;
      }

      if (seenClientIds.has(record.id)) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'DUPLICATE_IN_BATCH',
          message: 'Duplicate client ID in the same push batch',
        };
        continue;
      }
      seenClientIds.add(record.id);

      const data = record.data || {};
      const householdId = data.household_id || data.householdId;
      if (!householdId || !uuidRegex.test(householdId)) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'INVALID_HOUSEHOLD_ID',
          message: 'Household ID must be a valid UUID',
        };
        continue;
      }

      // Name validation
      const nameRes = GrsValidators.validateName(data.name);
      if (!nameRes.isValid) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'INVALID_NAME',
          message: `Name validation failed: ${nameRes.error}`,
        };
        continue;
      }

      // Age validation
      const ageRes = GrsValidators.validateAge(data.age);
      if (!ageRes.isValid) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'INVALID_AGE',
          message: `Age validation failed: ${ageRes.error}`,
        };
        continue;
      }

      // Gender validation
      const genderRes = GrsValidators.validateGender(data.gender);
      if (!genderRes.isValid) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'INVALID_GENDER',
          message: `Gender validation failed: ${genderRes.error}`,
        };
        continue;
      }

      // Consent validation (Invariant B2)
      const consentGiven =
        data.consent_given === true || data.consentGiven === true;
      if (!consentGiven) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'CONSENT_REQUIRED',
          message: 'Informed consent is mandatory before recording data',
        };
        continue;
      }

      const consentVersion = data.consent_version || data.consentVersion;
      if (!consentVersion || String(consentVersion).trim().length === 0) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'CONSENT_REQUIRED',
          message: 'Consent version is required',
        };
        continue;
      }

      if (consentVersion !== currentConsentVersion) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'CONSENT_REQUIRED',
          message: `Consent version must match current setting (${currentConsentVersion})`,
        };
        continue;
      }

      // Phone normalization (if provided)
      let phoneE164: string | null = null;
      const phoneRaw = data.phone_raw || data.phoneRaw || null;
      if (phoneRaw && String(phoneRaw).trim().length > 0) {
        const pRes = GrsValidators.normalizePhone(String(phoneRaw));
        if (pRes.isValid) {
          phoneE164 = pRes.value!;
        } else {
          results[i] = {
            id: record.id,
            status: 'rejected',
            code: 'INVALID_PHONE',
            message: `Phone validation failed: ${pRes.error}`,
          };
          continue;
        }
      }

      // WhatsApp normalization (if provided)
      let whatsappE164: string | null = null;
      const whatsappRaw = data.whatsapp_raw || data.whatsappRaw || null;
      if (whatsappRaw && String(whatsappRaw).trim().length > 0) {
        const wRes = GrsValidators.normalizeWhatsApp(String(whatsappRaw));
        if (wRes.isValid) {
          whatsappE164 = wRes.value!;
        } else {
          results[i] = {
            id: record.id,
            status: 'rejected',
            code: 'INVALID_WHATSAPP',
            message: `WhatsApp validation failed: ${wRes.error}`,
          };
          continue;
        }
      }

      // Future hopes validation
      const rawHopes = data.future_hopes || data.futureHopes;
      const parsedHopesArray = Array.isArray(rawHopes)
        ? rawHopes
        : typeof rawHopes === 'string' && rawHopes.startsWith('[')
          ? JSON.parse(rawHopes)
          : [];
      const hopesRes = GrsValidators.validateFutureHopes(parsedHopesArray);
      if (!hopesRes.isValid) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'INVALID_FUTURE_HOPES',
          message: `Future hopes validation failed: ${hopesRes.error}`,
        };
        continue;
      }

      // Information provided by validation
      const rawInfoBy = String(
        data.info_provided_by || data.infoProvidedBy || 'self',
      ).toLowerCase();
      if (!validInfoProvidedBy.has(rawInfoBy)) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'INVALID_INFO_PROVIDED_BY',
          message: `Information provided by must be one of: self, mother, father, sister, other`,
        };
        continue;
      }

      // Validate lookup codes against active lookup_values
      const highestEdu =
        data.highest_education || data.highestEducation || data.education;
      if (highestEdu && !activeLookups.get('education')?.has(highestEdu)) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'INVALID_LOOKUP',
          message: `Invalid or inactive highest education code: ${highestEdu}`,
        };
        continue;
      }

      const highestVoc =
        data.highest_vocational ||
        data.highestVocational ||
        data.vocational ||
        data.highest_vocational_qualification ||
        data.highestVocationalQualification;
      if (
        highestVoc &&
        !activeLookups.get('vocational_qualification')?.has(highestVoc)
      ) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'INVALID_LOOKUP',
          message: `Invalid or inactive highest vocational qualification code: ${highestVoc}`,
        };
        continue;
      }

      const stream =
        data.interested_vocational_stream ||
        data.interestedVocationalStream ||
        data.vocational_stream ||
        data.vocationalStream;
      if (stream && !activeLookups.get('vocational_stream')?.has(stream)) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'INVALID_LOOKUP',
          message: `Invalid or inactive interested vocational stream code: ${stream}`,
        };
        continue;
      }

      const job = data.interested_job || data.interestedJob || data.job;
      if (job && !activeLookups.get('job')?.has(job)) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'INVALID_LOOKUP',
          message: `Invalid or inactive interested job code: ${job}`,
        };
        continue;
      }

      const nameNorm = SyncService.normalizeName(nameRes.value!);
      const consentAt =
        data.consent_at || data.consentAt
          ? new Date(data.consent_at || data.consentAt)
          : new Date();
      const clientUpdatedAt =
        record.client_updated_at ||
          data.client_updated_at ||
          data.clientUpdatedAt
          ? new Date(
            record.client_updated_at ||
            data.client_updated_at ||
            data.clientUpdatedAt,
          )
          : new Date();

      const normalized = {
        householdId,
        name: nameRes.value!,
        nameNorm,
        age: ageRes.value!,
        gender: genderRes.value!,
        address: data.address ? String(data.address).trim() : null,
        phoneRaw: phoneRaw ? String(phoneRaw).trim() : null,
        phoneE164,
        whatsappRaw: whatsappRaw ? String(whatsappRaw).trim() : null,
        whatsappE164,
        highestEducation:
          data.highest_education ||
          data.highestEducation ||
          data.education ||
          null,
        highestVocational:
          data.highest_vocational ||
          data.highestVocational ||
          data.vocational ||
          data.highest_vocational_qualification ||
          data.highestVocationalQualification ||
          null,
        interestedVocationalStream:
          data.interested_vocational_stream ||
          data.interestedVocationalStream ||
          data.vocational_stream ||
          data.vocationalStream ||
          null,
        interestedJob:
          data.interested_job || data.interestedJob || data.job || null,
        isEpf: !!(data.is_epf ?? data.isEpf),
        isEtf: !!(data.is_etf ?? data.isEtf),
        isAswesuma: !!(data.is_aswesuma ?? data.isAswesuma),
        isSamurdhi: !!(data.is_samurdhi ?? data.isSamurdhi),
        hasSpecialNeeds: !!(data.has_special_needs ?? data.hasSpecialNeeds),
        futureHopes: hopesRes.value!,
        infoProvidedBy: rawInfoBy,
        infoProvidedByOther:
          data.info_provided_by_other || data.infoProvidedByOther || null,
        consentGiven: true,
        consentAt,
        consentVersion,
        clientUpdatedAt,
        contentHash: SyncService.computeContentHash({
          householdId,
          name: nameRes.value!,
          age: ageRes.value!,
          gender: genderRes.value!,
          address: data.address,
          phoneE164,
          whatsappE164,
          highestEducation:
            data.highest_education || data.highestEducation || data.education,
          highestVocational:
            data.highest_vocational ||
            data.highestVocational ||
            data.vocational ||
            data.highest_vocational_qualification ||
            data.highestVocationalQualification,
          interestedVocationalStream:
            data.interested_vocational_stream ||
            data.interestedVocationalStream ||
            data.vocational_stream ||
            data.vocationalStream,
          interestedJob: data.interested_job || data.interestedJob || data.job,
          isEpf: !!(data.is_epf ?? data.isEpf),
          isEtf: !!(data.is_etf ?? data.isEtf),
          isAswesuma: !!(data.is_aswesuma ?? data.isAswesuma),
          isSamurdhi: !!(data.is_samurdhi ?? data.isSamurdhi),
          hasSpecialNeeds: !!(data.has_special_needs ?? data.hasSpecialNeeds),
          futureHopes: hopesRes.value!,
          infoProvidedBy: rawInfoBy,
          infoProvidedByOther:
            data.info_provided_by_other || data.infoProvidedByOther,
          consentGiven: true,
        }),
      };

      validRecords.push({ index: i, record, normalized });
    }

    if (validRecords.length === 0) {
      return {
        results,
        finishedHouseholds: finishedHouseholdsResults,
      };
    }

    // --- STEP 2: Database checks in 2 parallel or batched queries ---
    const clientIds = validRecords.map((v) => v.record.id);
    const householdIds = [
      ...new Set(validRecords.map((v) => v.normalized.householdId)),
    ];

    // Query 1 & Query 2 (dispatched together)
    const [existingClients, households] = await Promise.all([
      this.prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: {
          id: true,
          collectedBy: true,
          householdId: true,
          serverVersion: true,
          contentHash: true,
        },
      }),
      this.prisma.household.findMany({
        where: { id: { in: householdIds } },
        select: {
          id: true,
          districtId: true,
          dsId: true,
          gnId: true,
          teamId: true,
          address: true,
          deletedAt: true,
        },
      }),
    ]);

    const existingMap = new Map<string, (typeof existingClients)[0]>(
      existingClients.map((c) => [c.id, c]),
    );
    const householdMap = new Map<string, (typeof households)[0]>(
      households.map((h) => [h.id, h]),
    );

    // --- STEP 3: Per-record business decisions in code (§8.3 #3) ---
    const toUpsert: Array<{
      index: number;
      id: string;
      householdId: string;
      districtId: string;
      dsId: string;
      gnId: string;
      teamId: string | null;
      norm: (typeof validRecords)[0]['normalized'];
      isUpdate: boolean;
      currentServerVersion: number;
    }> = [];

    for (const item of validRecords) {
      const idx = item.index;
      const rec = item.record;
      const norm = item.normalized;
      const household = householdMap.get(norm.householdId);

      // Check household existence
      if (!household) {
        results[idx] = {
          id: rec.id,
          status: 'forbidden',
          code: 'HOUSEHOLD_NOT_FOUND',
          message: 'Target household not found',
        };
        continue;
      }

      // Check soft-deleted household (§8.3 forbidden)
      if (household.deletedAt) {
        results[idx] = {
          id: rec.id,
          status: 'forbidden',
          code: 'HOUSEHOLD_DELETED',
          message:
            'Target household has been deleted and cannot accept client records',
        };
        continue;
      }

      // Check caller scope per role (§8.3 & Blueprint §10.3 & Decision C20)
      if (user.role === 'team_member') {
        // Level 5 (agent): strictly own team's households
        if (!user.teamId || household.teamId !== user.teamId) {
          results[idx] = {
            id: rec.id,
            status: 'forbidden',
            code: 'HOUSEHOLD_OUT_OF_SCOPE',
            message: 'Household is outside caller team scope',
          };
          continue;
        }
      } else if (user.role === 'cdc_secretary') {
        // Level 4 (secretary): strictly own team's households
        const matchesTeam =
          household.teamId && assignedTeams.has(household.teamId);
        if (!matchesTeam) {
          results[idx] = {
            id: rec.id,
            status: 'forbidden',
            code: 'HOUSEHOLD_OUT_OF_SCOPE',
            message: 'Household is outside caller team scope',
          };
          continue;
        }
      } else if (user.role === 'sda') {
        // Level 3 (sda): divisional scope
        if (!user.dsId || household.dsId !== user.dsId) {
          results[idx] = {
            id: rec.id,
            status: 'forbidden',
            code: 'HOUSEHOLD_OUT_OF_SCOPE',
            message: 'Household is outside caller DS division scope',
          };
          continue;
        }
      } else if (user.role === 'dc') {
        // Level 2 (dc): district scope
        if (!user.districtId || household.districtId !== user.districtId) {
          results[idx] = {
            id: rec.id,
            status: 'forbidden',
            code: 'HOUSEHOLD_OUT_OF_SCOPE',
            message: 'Household is outside caller district scope',
          };
          continue;
        }
      } else if (
        user.role === 'super_admin' ||
        user.role === 'admin' ||
        user.role === 'cg'
      ) {
        // Levels 00, 0, 1: National scope (any non-deleted household)
      } else {
        results[idx] = {
          id: rec.id,
          status: 'forbidden',
          code: 'ROLE_UNAUTHORIZED',
          message: 'Role not authorized to push client records',
        };
        continue;
      }

      // Check existing client row
      const existing = existingMap.get(rec.id);
      if (existing) {
        // Never overwrite someone else's record (§8.3 #3)
        if (existing.collectedBy !== user.userId) {
          results[idx] = {
            id: rec.id,
            status: 'forbidden',
            code: 'RECORD_OWNED_BY_ANOTHER_USER',
            message: 'Client survey belongs to another agent',
          };
          continue;
        }

        // Retry after lost response (same content hash) -> return ok with existing server version
        if (existing.contentHash === norm.contentHash) {
          results[idx] = {
            id: rec.id,
            status: 'ok',
            server_version: existing.serverVersion,
          };
          continue;
        }

        // Different content: if caller is Level 5 -> locked (Decision C2)
        // Confirmed records in database cannot be overwritten by Level 5 agents with differing content, even with base_version: 0
        if (user.role === 'team_member') {
          results[idx] = {
            id: rec.id,
            status: 'locked',
            code: 'RECORD_LOCKED',
            message: 'Confirmed records cannot be modified by Level 5 agents',
          };
          continue;
        }

        toUpsert.push({
          index: idx,
          id: rec.id,
          householdId: household.id,
          districtId: household.districtId,
          dsId: household.dsId,
          gnId: household.gnId,
          teamId: household.teamId,
          norm,
          isUpdate: true,
          currentServerVersion: existing.serverVersion,
        });
      } else {
        toUpsert.push({
          index: idx,
          id: rec.id,
          householdId: household.id,
          districtId: household.districtId,
          dsId: household.dsId,
          gnId: household.gnId,
          teamId: household.teamId,
          norm,
          isUpdate: false,
          currentServerVersion: 0,
        });
      }
    }

    // --- STEP 4: Query 3 — Single Bulk Upsert with ON CONFLICT DO UPDATE ---
    if (toUpsert.length > 0) {
      const now = new Date();
      const valuePlaceholders: string[] = [];
      const queryParams: any[] = [];
      let pIdx = 1;

      for (const u of toUpsert) {
        const norm = u.norm;
        valuePlaceholders.push(`(
          $${pIdx++}::uuid,
          $${pIdx++}::uuid,
          $${pIdx++}::uuid,
          $${pIdx++}::uuid,
          $${pIdx++}::uuid,
          ${u.teamId ? `$${pIdx++}::uuid` : `NULL::uuid`},
          $${pIdx++},
          $${pIdx++},
          $${pIdx++}::integer,
          $${pIdx++}::"gender",
          $${pIdx++},
          $${pIdx++},
          $${pIdx++},
          $${pIdx++},
          $${pIdx++},
          $${pIdx++},
          $${pIdx++},
          $${pIdx++},
          $${pIdx++},
          $${pIdx++}::boolean,
          $${pIdx++}::boolean,
          $${pIdx++}::boolean,
          $${pIdx++}::boolean,
          $${pIdx++}::boolean,
          $${pIdx++}::text[],
          $${pIdx++}::"info_provided_by",
          $${pIdx++},
          $${pIdx++}::boolean,
          $${pIdx++}::timestamptz,
          $${pIdx++},
          $${pIdx++}::uuid,
          $${pIdx++}::timestamptz,
          $${pIdx++},
          $${pIdx++}::timestamptz,
          $${pIdx++}::integer,
          $${pIdx++},
          $${pIdx++}::timestamptz,
          $${pIdx++},
          $${pIdx++},
          $${pIdx++}::timestamptz,
          $${pIdx++}::uuid,
          $${pIdx++}::uuid
        )`);

        queryParams.push(u.id, u.householdId, u.districtId, u.dsId, u.gnId);
        if (u.teamId) {
          queryParams.push(u.teamId);
        }
        queryParams.push(
          norm.name,
          norm.nameNorm,
          norm.age,
          norm.gender,
          norm.address,
          norm.phoneRaw,
          norm.phoneE164,
          norm.whatsappRaw,
          norm.whatsappE164,
          norm.highestEducation,
          norm.highestVocational,
          norm.interestedVocationalStream,
          norm.interestedJob,
          norm.isEpf,
          norm.isEtf,
          norm.isAswesuma,
          norm.isSamurdhi,
          norm.hasSpecialNeeds,
          norm.futureHopes,
          norm.infoProvidedBy,
          norm.infoProvidedByOther,
          norm.consentGiven,
          norm.consentAt.toISOString(),
          norm.consentVersion,
          user.userId,
          now.toISOString(),
          dto.device_id,
          norm.clientUpdatedAt.toISOString(),
          u.isUpdate ? u.currentServerVersion + 1 : 1,
          norm.contentHash,
          now.toISOString(),
          dto.app_version,
          String(dto.schema_version ?? 1),
          now.toISOString(),
          user.userId,
          user.userId,
        );
      }

      const bulkSql = `
        WITH upserted AS (
          INSERT INTO clients (
          id, household_id, district_id, ds_id, gn_id, team_id,
          name, name_norm, age, gender, address,
          phone_raw, phone_e164, whatsapp_raw, whatsapp_e164,
          highest_education, highest_vocational, interested_vocational_stream, interested_job,
          is_epf, is_etf, is_aswesuma, is_samurdhi, has_special_needs,
          future_hopes, info_provided_by, info_provided_by_other,
          consent_given, consent_at, consent_version,
          collected_by, collected_at, device_id, client_updated_at,
          server_version, content_hash, received_at, app_version, schema_version,
          synced_at, created_by, updated_by
        )
        VALUES
          ${valuePlaceholders.join(',\n')}
        ON CONFLICT (id) DO UPDATE SET
          household_id = EXCLUDED.household_id,
          district_id = EXCLUDED.district_id,
          ds_id = EXCLUDED.ds_id,
          gn_id = EXCLUDED.gn_id,
          team_id = EXCLUDED.team_id,
          name = EXCLUDED.name,
          name_norm = EXCLUDED.name_norm,
          age = EXCLUDED.age,
          gender = EXCLUDED.gender,
          address = EXCLUDED.address,
          phone_raw = EXCLUDED.phone_raw,
          phone_e164 = EXCLUDED.phone_e164,
          whatsapp_raw = EXCLUDED.whatsapp_raw,
          whatsapp_e164 = EXCLUDED.whatsapp_e164,
          highest_education = EXCLUDED.highest_education,
          highest_vocational = EXCLUDED.highest_vocational,
          interested_vocational_stream = EXCLUDED.interested_vocational_stream,
          interested_job = EXCLUDED.interested_job,
          is_epf = EXCLUDED.is_epf,
          is_etf = EXCLUDED.is_etf,
          is_aswesuma = EXCLUDED.is_aswesuma,
          is_samurdhi = EXCLUDED.is_samurdhi,
          has_special_needs = EXCLUDED.has_special_needs,
          future_hopes = EXCLUDED.future_hopes,
          info_provided_by = EXCLUDED.info_provided_by,
          info_provided_by_other = EXCLUDED.info_provided_by_other,
          consent_given = EXCLUDED.consent_given,
          consent_at = EXCLUDED.consent_at,
          consent_version = EXCLUDED.consent_version,
          client_updated_at = EXCLUDED.client_updated_at,
          server_version = clients.server_version + 1,
          content_hash = EXCLUDED.content_hash,
          synced_at = EXCLUDED.synced_at,
          updated_by = EXCLUDED.updated_by
        WHERE clients.collected_by = EXCLUDED.collected_by
        RETURNING id, server_version, team_id
      ),
      updated_teams AS (
        UPDATE teams
        SET stats_dirty_at = NOW()
        WHERE id IN (
          SELECT DISTINCT team_id FROM upserted WHERE team_id IS NOT NULL
        )
        RETURNING id
      )
      SELECT id, server_version FROM upserted;
      `;

      try {
        const returnedRows = await this.prisma.$queryRawUnsafe<
          Array<{ id: string; server_version: number }>
        >(bulkSql, ...queryParams);

        const returnedMap = new Map<string, number>(
          returnedRows.map((r) => [r.id, r.server_version]),
        );

        for (const item of toUpsert) {
          const version = returnedMap.get(item.id);
          if (version !== undefined) {
            results[item.index] = {
              id: item.id,
              status: 'ok',
              server_version: version,
            };
          } else {
            // Missing from RETURNING means lost race against another collector (transient race conflict)
            results[item.index] = {
              id: item.id,
              status: 'stale',
              code: 'RACE_CONFLICT',
              message: 'Record updated by another user concurrently',
            };
          }
        }

        if (this.duplicatesService && returnedRows.length > 0) {
          const committedIds = returnedRows.map((r) => r.id);
          try {
            await this.duplicatesService.scoreCommittedClients(committedIds);
          } catch (dupErr: any) {
            this.logger.warn(
              `Post-commit duplicate scoring skipped for ${committedIds.length} record(s): ${dupErr?.message || 'unknown'}`,
            );
          }
        }
      } catch (err: any) {
        this.logger.error(
          `Bulk upsert query failed: ${err.message}`,
          err.stack,
        );
        throw err;
      }
    }

    return {
      results,
      finishedHouseholds: finishedHouseholdsResults,
    };
  }
}
