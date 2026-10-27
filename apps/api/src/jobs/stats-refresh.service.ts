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
  async refreshStats(options?: {
    forceAll?: boolean;
  }): Promise<{ refreshedTeams: number; refreshedAt: Date }> {
    const refreshedAt = new Date();

    if (options?.forceAll) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "teams" SET "stats_dirty_at" = CURRENT_TIMESTAMP;`,
      );
    }

    // Call stored procedure to refresh dirty teams into team_stats
    await this.prisma.$executeRawUnsafe(
      `SELECT public.refresh_dirty_team_stats();`,
    );

    // Roll up team_stats into area_stats in a single atomic SQL operation
    await this.rollupAreaStats(refreshedAt);

    this.logger.log(
      `Refreshed team and area stats at ${refreshedAt.toISOString()}`,
    );
    return { refreshedTeams: 1, refreshedAt };
  }

  /**
   * Rolls up team_stats into area_stats across hierarchical levels: GN -> DS -> District -> National in a single query.
   */
  private async rollupAreaStats(refreshedAt: Date): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "area_stats" (
        "id",
        "area_type",
        "area_id",
        "houses_assigned",
        "houses_started",
        "houses_done",
        "clients_count",
        "epf_count",
        "etf_count",
        "aswesuma_count",
        "samurdhi_count",
        "special_needs_count",
        "refreshed_at"
      )
      SELECT
        gen_random_uuid(),
        'gn' AS "area_type",
        "gn_id"::text AS "area_id",
        COALESCE(SUM("houses_assigned"), 0)::int,
        COALESCE(SUM("houses_started"), 0)::int,
        COALESCE(SUM("houses_done"), 0)::int,
        COALESCE(SUM("clients_count"), 0)::int,
        COALESCE(SUM("epf_count"), 0)::int,
        COALESCE(SUM("etf_count"), 0)::int,
        COALESCE(SUM("aswesuma_count"), 0)::int,
        COALESCE(SUM("samurdhi_count"), 0)::int,
        COALESCE(SUM("special_needs_count"), 0)::int,
        CURRENT_TIMESTAMP
      FROM "team_stats"
      GROUP BY "gn_id"
      UNION ALL
      SELECT
        gen_random_uuid(),
        'ds' AS "area_type",
        "ds_id"::text AS "area_id",
        COALESCE(SUM("houses_assigned"), 0)::int,
        COALESCE(SUM("houses_started"), 0)::int,
        COALESCE(SUM("houses_done"), 0)::int,
        COALESCE(SUM("clients_count"), 0)::int,
        COALESCE(SUM("epf_count"), 0)::int,
        COALESCE(SUM("etf_count"), 0)::int,
        COALESCE(SUM("aswesuma_count"), 0)::int,
        COALESCE(SUM("samurdhi_count"), 0)::int,
        COALESCE(SUM("special_needs_count"), 0)::int,
        CURRENT_TIMESTAMP
      FROM "team_stats"
      GROUP BY "ds_id"
      UNION ALL
      SELECT
        gen_random_uuid(),
        'district' AS "area_type",
        "district_id"::text AS "area_id",
        COALESCE(SUM("houses_assigned"), 0)::int,
        COALESCE(SUM("houses_started"), 0)::int,
        COALESCE(SUM("houses_done"), 0)::int,
        COALESCE(SUM("clients_count"), 0)::int,
        COALESCE(SUM("epf_count"), 0)::int,
        COALESCE(SUM("etf_count"), 0)::int,
        COALESCE(SUM("aswesuma_count"), 0)::int,
        COALESCE(SUM("samurdhi_count"), 0)::int,
        COALESCE(SUM("special_needs_count"), 0)::int,
        CURRENT_TIMESTAMP
      FROM "team_stats"
      GROUP BY "district_id"
      UNION ALL
      SELECT
        gen_random_uuid(),
        'national' AS "area_type",
        'national' AS "area_id",
        COALESCE(SUM("houses_assigned"), 0)::int,
        COALESCE(SUM("houses_started"), 0)::int,
        COALESCE(SUM("houses_done"), 0)::int,
        COALESCE(SUM("clients_count"), 0)::int,
        COALESCE(SUM("epf_count"), 0)::int,
        COALESCE(SUM("etf_count"), 0)::int,
        COALESCE(SUM("aswesuma_count"), 0)::int,
        COALESCE(SUM("samurdhi_count"), 0)::int,
        COALESCE(SUM("special_needs_count"), 0)::int,
        CURRENT_TIMESTAMP
      FROM "team_stats"
      HAVING COUNT(*) > 0
      ON CONFLICT ("area_type", "area_id") DO UPDATE SET
        "houses_assigned" = EXCLUDED."houses_assigned",
        "houses_started" = EXCLUDED."houses_started",
        "houses_done" = EXCLUDED."houses_done",
        "clients_count" = EXCLUDED."clients_count",
        "epf_count" = EXCLUDED."epf_count",
        "etf_count" = EXCLUDED."etf_count",
        "aswesuma_count" = EXCLUDED."aswesuma_count",
        "samurdhi_count" = EXCLUDED."samurdhi_count",
        "special_needs_count" = EXCLUDED."special_needs_count",
        "refreshed_at" = EXCLUDED."refreshed_at";
    `);
  }

  /**
   * Nightly drift check (M1.14 / Section 12.3):
   * Asserts that summary tables match fresh SQL counts exactly.
   * Drift must be zero.
   */
  async checkDrift(): Promise<DriftReport> {
    const freshClients = await this.prisma.client.count({
      where: { deletedAt: null, teamId: { not: null } },
    });
    const freshHouseholds = await this.prisma.household.count({
      where: { deletedAt: null, teamId: { not: null } },
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
      this.logger.warn(
        `DRIFT DETECTED: clientDrift=${clientDrift}, householdDrift=${householdDrift}`,
      );
    } else {
      this.logger.log(
        `Nightly drift check PASSED: ZERO drift (fresh=${freshClients}, summary=${totalSummaryClients})`,
      );
    }

    return report;
  }
}
