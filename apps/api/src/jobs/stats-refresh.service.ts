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
    let refreshedTeams = 0;
    try {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{ refresh_dirty_team_stats: any } | { count: any }>
      >(
        `SELECT public.refresh_dirty_team_stats()::text AS refresh_dirty_team_stats;`,
      );
      refreshedTeams = Number(
        (rows[0] as any)?.refresh_dirty_team_stats ??
        (rows[0] as any)?.count ??
        0,
      );
    } catch {
      await this.prisma.$executeRawUnsafe(
        `SELECT public.refresh_dirty_team_stats();`,
      );
    }

    // Clean up team_stats for deleted teams
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM "team_stats" WHERE "team_id" NOT IN (SELECT "id" FROM "teams");`,
    );

    // Roll up team_stats into area_stats in a single atomic SQL operation
    await this.rollupAreaStats(refreshedAt);

    this.logger.log(
      `Refreshed ${refreshedTeams} team(s) and area stats at ${refreshedAt.toISOString()}`,
    );
    return { refreshedTeams, refreshedAt };
  }

  /**
   * Rolls up team_stats into area_stats across hierarchical levels: GN -> DS -> District -> National in a single query.
   */
  private async rollupAreaStats(refreshedAt: Date): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      WITH unassigned_gn AS (
        SELECT "gn_id", COUNT(*)::int AS cnt
        FROM "households"
        WHERE "deleted_at" IS NULL AND "team_id" IS NULL
        GROUP BY "gn_id"
      ),
      unassigned_ds AS (
        SELECT "ds_id", COUNT(*)::int AS cnt
        FROM "households"
        WHERE "deleted_at" IS NULL AND "team_id" IS NULL
        GROUP BY "ds_id"
      ),
      unassigned_district AS (
        SELECT "district_id", COUNT(*)::int AS cnt
        FROM "households"
        WHERE "deleted_at" IS NULL AND "team_id" IS NULL
        GROUP BY "district_id"
      ),
      unassigned_national AS (
        SELECT COUNT(*)::int AS cnt
        FROM "households"
        WHERE "deleted_at" IS NULL AND "team_id" IS NULL
      )
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
        ts."gn_id"::text AS "area_id",
        (COALESCE(SUM(ts."houses_assigned"), 0) + COALESCE(MAX(u.cnt), 0))::int,
        COALESCE(SUM(ts."houses_started"), 0)::int,
        COALESCE(SUM(ts."houses_done"), 0)::int,
        COALESCE(SUM(ts."clients_count"), 0)::int,
        COALESCE(SUM(ts."epf_count"), 0)::int,
        COALESCE(SUM(ts."etf_count"), 0)::int,
        COALESCE(SUM(ts."aswesuma_count"), 0)::int,
        COALESCE(SUM(ts."samurdhi_count"), 0)::int,
        COALESCE(SUM(ts."special_needs_count"), 0)::int,
        CURRENT_TIMESTAMP
      FROM "team_stats" ts
      LEFT JOIN unassigned_gn u ON u."gn_id" = ts."gn_id"
      GROUP BY ts."gn_id"
      UNION ALL
      SELECT
        gen_random_uuid(),
        'ds' AS "area_type",
        ts."ds_id"::text AS "area_id",
        (COALESCE(SUM(ts."houses_assigned"), 0) + COALESCE(MAX(u.cnt), 0))::int,
        COALESCE(SUM(ts."houses_started"), 0)::int,
        COALESCE(SUM(ts."houses_done"), 0)::int,
        COALESCE(SUM(ts."clients_count"), 0)::int,
        COALESCE(SUM(ts."epf_count"), 0)::int,
        COALESCE(SUM(ts."etf_count"), 0)::int,
        COALESCE(SUM(ts."aswesuma_count"), 0)::int,
        COALESCE(SUM(ts."samurdhi_count"), 0)::int,
        COALESCE(SUM(ts."special_needs_count"), 0)::int,
        CURRENT_TIMESTAMP
      FROM "team_stats" ts
      LEFT JOIN unassigned_ds u ON u."ds_id" = ts."ds_id"
      GROUP BY ts."ds_id"
      UNION ALL
      SELECT
        gen_random_uuid(),
        'district' AS "area_type",
        ts."district_id"::text AS "area_id",
        (COALESCE(SUM(ts."houses_assigned"), 0) + COALESCE(MAX(u.cnt), 0))::int,
        COALESCE(SUM(ts."houses_started"), 0)::int,
        COALESCE(SUM(ts."houses_done"), 0)::int,
        COALESCE(SUM(ts."clients_count"), 0)::int,
        COALESCE(SUM(ts."epf_count"), 0)::int,
        COALESCE(SUM(ts."etf_count"), 0)::int,
        COALESCE(SUM(ts."aswesuma_count"), 0)::int,
        COALESCE(SUM(ts."samurdhi_count"), 0)::int,
        COALESCE(SUM(ts."special_needs_count"), 0)::int,
        CURRENT_TIMESTAMP
      FROM "team_stats" ts
      LEFT JOIN unassigned_district u ON u."district_id" = ts."district_id"
      GROUP BY ts."district_id"
      UNION ALL
      SELECT
        gen_random_uuid(),
        'national' AS "area_type",
        'national' AS "area_id",
        (COALESCE(SUM(ts."houses_assigned"), 0) + COALESCE((SELECT cnt FROM unassigned_national), 0))::int,
        COALESCE(SUM(ts."houses_started"), 0)::int,
        COALESCE(SUM(ts."houses_done"), 0)::int,
        COALESCE(SUM(ts."clients_count"), 0)::int,
        COALESCE(SUM(ts."epf_count"), 0)::int,
        COALESCE(SUM(ts."etf_count"), 0)::int,
        COALESCE(SUM(ts."aswesuma_count"), 0)::int,
        COALESCE(SUM(ts."samurdhi_count"), 0)::int,
        COALESCE(SUM(ts."special_needs_count"), 0)::int,
        CURRENT_TIMESTAMP
      FROM "team_stats" ts
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
      where: { deletedAt: null, duplicateOf: null, teamId: { not: null } },
    });
    const freshHouseholds = await this.prisma.household.count({
      where: { deletedAt: null },
    });

    const summaryClientAgg = await this.prisma.teamStat.aggregate({
      _sum: { clientsCount: true, housesAssigned: true },
    });

    const nationalStat = await this.prisma.areaStat.findUnique({
      where: {
        areaType_areaId: {
          areaType: 'national',
          areaId: 'national',
        },
      },
    });

    const totalSummaryClients = summaryClientAgg._sum.clientsCount || 0;
    const totalSummaryHouseholds =
      nationalStat?.housesAssigned ??
      (summaryClientAgg._sum.housesAssigned || 0);

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

  /**
   * Executes public.purge_expired_data() stored procedure (simulating pg_cron grs_data_purge_job).
   * Purges expired refresh tokens, old rate limits, expired email codes, and old import staging/batches.
   */
  async purgeExpiredData(): Promise<any> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT public.purge_expired_data() AS result;`,
      );
      return rows?.[0]?.result ?? null;
    } catch {
      await this.prisma.$executeRawUnsafe(`SELECT public.purge_expired_data();`);
      return null;
    }
  }
}
