import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface DriftReport {
  timestamp: string;
  totalFreshClients: number;
  totalSummaryClients: number;
  clientDrift: number;
  totalFreshHouseholds: number;
  totalSummaryHouseholds: number;
  householdDrift: number;
  passed: boolean;
}

@Injectable()
export class StatsRefreshService {
  private readonly logger = new Logger(StatsRefreshService.name);

  constructor(private readonly prisma: PrismaService) { }

  /**
   * Refreshes team_stats for all dirty teams (or all teams if forceAll),
   * then rolls up area_stats for gn, ds, district, and national scopes (M1.14 / Section 8.5).
   */
  async refreshStats(options?: { forceAll?: boolean }): Promise<{ refreshedTeams: number; refreshedAt: Date }> {
    const refreshedAt = new Date();

    // 1. Identify teams needing refresh
    const dirtyTeams = await this.prisma.team.findMany({
      where: options?.forceAll ? {} : { statsDirtyAt: { not: null } },
      select: { id: true, gnId: true },
    });

    if (dirtyTeams.length === 0) {
      return { refreshedTeams: 0, refreshedAt };
    }

    // 2. Recompute team_stats for each dirty team from source records
    for (const team of dirtyTeams) {
      // Find area hierarchy for this team
      const gn = await this.prisma.gnDivision.findUnique({
        where: { id: team.gnId },
        include: { ds: true },
      });

      if (!gn) continue;

      const dsId = gn.dsId;
      const districtId = gn.ds.districtId;

      // Fresh count of households assigned to this team
      const housesAssigned = await this.prisma.household.count({
        where: { teamId: team.id, deletedAt: null },
      });

      // Fresh count of clients collected in this team
      const clients = await this.prisma.client.findMany({
        where: { teamId: team.id, deletedAt: null },
        select: {
          id: true,
          householdId: true,
          isEpf: true,
          isEtf: true,
          isAswesuma: true,
          isSamurdhi: true,
          hasSpecialNeeds: true,
        },
      });

      const clientsCount = clients.length;
      const epfCount = clients.filter((c) => c.isEpf).length;
      const etfCount = clients.filter((c) => c.isEtf).length;
      const aswesumaCount = clients.filter((c) => c.isAswesuma).length;
      const samurdhiCount = clients.filter((c) => c.isSamurdhi).length;
      const specialNeedsCount = clients.filter((c) => c.hasSpecialNeeds).length;

      // Unique households with at least one client
      const startedHouseIds = new Set(clients.map((c) => c.householdId));
      const housesStarted = startedHouseIds.size;
      const housesDone = housesStarted; // Done when beneficiaries recorded

      // Upsert into team_stats
      await this.prisma.teamStat.upsert({
        where: { teamId: team.id },
        create: {
          teamId: team.id,
          gnId: team.gnId,
          dsId,
          districtId,
          housesAssigned,
          housesStarted,
          housesDone,
          clientsCount,
          epfCount,
          etfCount,
          aswesumaCount,
          samurdhiCount,
          specialNeedsCount,
          refreshedAt,
        },
        update: {
          gnId: team.gnId,
          dsId,
          districtId,
          housesAssigned,
          housesStarted,
          housesDone,
          clientsCount,
          epfCount,
          etfCount,
          aswesumaCount,
          samurdhiCount,
          specialNeedsCount,
          refreshedAt,
        },
      });

      // Clear team dirty flag
      await this.prisma.team.update({
        where: { id: team.id },
        data: { statsDirtyAt: null },
      });
    }

    // 3. Roll up into area_stats for gn, ds, district, and national
    await this.rollupAreaStats(refreshedAt);

    this.logger.log(`Refreshed stats for ${dirtyTeams.length} teams at ${refreshedAt.toISOString()}`);
    return { refreshedTeams: dirtyTeams.length, refreshedAt };
  }

  /**
   * Rolls up team_stats into area_stats across hierarchical levels: GN -> DS -> District -> National.
   */
  private async rollupAreaStats(refreshedAt: Date): Promise<void> {
    const allTeamStats = await this.prisma.teamStat.findMany();

    const rollups: Record<string, {
      areaType: string;
      areaId: string;
      housesAssigned: number;
      housesStarted: number;
      housesDone: number;
      clientsCount: number;
      epfCount: number;
      etfCount: number;
      aswesumaCount: number;
      samurdhiCount: number;
      specialNeedsCount: number;
    }> = {};

    const addToRollup = (areaType: string, areaId: string, stat: typeof allTeamStats[0]) => {
      const key = `${areaType}:${areaId}`;
      if (!rollups[key]) {
        rollups[key] = {
          areaType,
          areaId,
          housesAssigned: 0,
          housesStarted: 0,
          housesDone: 0,
          clientsCount: 0,
          epfCount: 0,
          etfCount: 0,
          aswesumaCount: 0,
          samurdhiCount: 0,
          specialNeedsCount: 0,
        };
      }
      rollups[key].housesAssigned += stat.housesAssigned;
      rollups[key].housesStarted += stat.housesStarted;
      rollups[key].housesDone += stat.housesDone;
      rollups[key].clientsCount += stat.clientsCount;
      rollups[key].epfCount += stat.epfCount;
      rollups[key].etfCount += stat.etfCount;
      rollups[key].aswesumaCount += stat.aswesumaCount;
      rollups[key].samurdhiCount += stat.samurdhiCount;
      rollups[key].specialNeedsCount += stat.specialNeedsCount;
    };

    for (const stat of allTeamStats) {
      // 1. GN Rollup
      addToRollup('gn', stat.gnId, stat);
      // 2. DS Rollup
      addToRollup('ds', stat.dsId, stat);
      // 3. District Rollup
      addToRollup('district', stat.districtId, stat);
      // 4. National Rollup
      addToRollup('national', 'national', stat);
    }

    // Persist all rollups into area_stats
    for (const r of Object.values(rollups)) {
      await this.prisma.areaStat.upsert({
        where: {
          areaType_areaId: {
            areaType: r.areaType,
            areaId: r.areaId,
          },
        },
        create: {
          ...r,
          refreshedAt,
        },
        update: {
          ...r,
          refreshedAt,
        },
      });
    }
  }

  /**
   * Nightly drift check (M1.14 / Section 12.3):
   * Asserts that summary tables match fresh SQL counts exactly.
   * Drift must be zero.
   */
  async checkDrift(): Promise<DriftReport> {
    const freshClients = await this.prisma.client.count({
      where: { deletedAt: null },
    });
    const freshHouseholds = await this.prisma.household.count({
      where: { deletedAt: null },
    });

    const summaryClientAgg = await this.prisma.teamStat.aggregate({
      _sum: { clientsCount: true, housesAssigned: true },
    });

    const totalSummaryClients = summaryClientAgg._sum.clientsCount || 0;
    const totalSummaryHouseholds = summaryClientAgg._sum.housesAssigned || 0;

    const clientDrift = Math.abs(freshClients - totalSummaryClients);
    const householdDrift = Math.abs(freshHouseholds - totalSummaryHouseholds);

    const passed = clientDrift === 0 && householdDrift === 0;

    const report: DriftReport = {
      timestamp: new Date().toISOString(),
      totalFreshClients: freshClients,
      totalSummaryClients,
      clientDrift,
      totalFreshHouseholds: freshHouseholds,
      totalSummaryHouseholds,
      householdDrift,
      passed,
    };

    if (!passed) {
      this.logger.warn(`DRIFT DETECTED: clientDrift=${clientDrift}, householdDrift=${householdDrift}`);
    } else {
      this.logger.log(`Nightly drift check PASSED: ZERO drift (fresh=${freshClients}, summary=${totalSummaryClients})`);
    }

    return report;
  }
}
