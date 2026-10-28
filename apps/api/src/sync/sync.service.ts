import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LookupService } from '../lookups/lookup.service';
import type { ScopeContext } from '../common/scope/scope.types';

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
  ) { }

  /**
   * Paged, resumable area download endpoint per DD-Campaign_Agent_Build_Plan.md §6.2.
   * Returns up to limit (≤ 500) households scoped to the user's assigned area/team.
   */
  async getAreaData(
    user: ScopeContext,
    cursor?: string,
    limit: number = 500,
  ): Promise<AreaSyncResult> {
    const take = Math.min(Math.max(1, limit), 500);

    const where: any = { deletedAt: null };
    if (user.teamId) {
      where.teamId = user.teamId;
    } else if (user.gnId) {
      where.gnId = user.gnId;
    } else if (user.dsId) {
      where.dsId = user.dsId;
    } else if (user.districtId) {
      where.districtId = user.districtId;
    }

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
        this.logger.warn(`Failed to attach lookups to initial area sync: ${err.message}`);
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
}
