import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope/scope.service';
import { ScopeContext, UserRole } from '../common/scope/scope.types';
import { StatsRefreshService } from '../jobs/stats-refresh.service';

const VALID_AREA_TYPES = ['national', 'district', 'ds', 'gn', 'team'] as const;

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: ScopeService,
    @Optional()
    private readonly statsRefreshService?: StatsRefreshService,
  ) { }

  async getProgress(
    caller: ScopeContext,
    query?: { areaType?: string; areaId?: string; refresh?: string },
  ) {
    if (query?.areaType && !VALID_AREA_TYPES.includes(query.areaType as any)) {
      throw new BadRequestException({
        code: 'INVALID_AREA_TYPE',
        message: 'areaType must be one of: national, district, ds, gn, team',
      });
    }

    if (query?.refresh === 'true' && this.statsRefreshService) {
      try {
        await this.statsRefreshService.refreshStats();
      } catch { }
    }

    let targetAreaType = query?.areaType;
    let targetAreaId = query?.areaId;

    if (!targetAreaType || !targetAreaId) {
      if (caller.role === UserRole.team_member) {
        targetAreaType = 'team';
        targetAreaId = caller.teamId || '';
      } else if (caller.role === UserRole.cdc_secretary) {
        targetAreaType = 'gn';
        targetAreaId = caller.gnId || '';
        if (!targetAreaId && this.prisma.profileAssignment?.findFirst) {
          const assign = await this.prisma.profileAssignment.findFirst({
            where: { profileId: caller.userId, validTo: null },
            select: { gnId: true },
            orderBy: { createdAt: 'asc' },
          });
          if (assign?.gnId) targetAreaId = assign.gnId;
        }
      } else if (caller.role === UserRole.sda) {
        targetAreaType = 'ds';
        targetAreaId = caller.dsId || '';
      } else if (caller.role === UserRole.dc) {
        targetAreaType = 'district';
        targetAreaId = caller.districtId || '';
      } else {
        targetAreaType = 'national';
        targetAreaId = 'national';
      }
    }

    // Role scope verification
    if (caller.role === UserRole.team_member) {
      if (targetAreaType !== 'team' || targetAreaId !== caller.teamId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message:
            'Team member can only view statistics for their assigned team',
        });
      }
    } else if (caller.role === UserRole.cdc_secretary) {
      if (targetAreaType !== 'gn' && targetAreaType !== 'team') {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message:
            'CDC Secretary can only view GN or team statistics within their GN division',
        });
      }
      if (targetAreaType === 'gn') {
        let isAllowed = targetAreaId === caller.gnId;
        if (!isAllowed && this.prisma.profileAssignment?.findFirst) {
          const assign = await this.prisma.profileAssignment.findFirst({
            where: {
              profileId: caller.userId,
              gnId: targetAreaId,
              validTo: null,
            },
          });
          if (assign) isAllowed = true;
        }
        if (!isAllowed && (this.prisma as any).accountAssignment?.findFirst) {
          const assign = await (this.prisma as any).accountAssignment.findFirst({
            where: {
              profileId: caller.userId,
              gnId: targetAreaId,
              status: 'active',
            },
          });
          if (assign) isAllowed = true;
        }
        if (!isAllowed) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE',
            message: 'Cannot view statistics for another GN division',
          });
        }
      }
      if (targetAreaType === 'team') {
        const team = await this.prisma.team.findUnique({
          where: { id: targetAreaId },
          select: { gnId: true },
        });
        if (!team) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE',
            message:
              'Cannot view statistics for a team outside your GN division',
          });
        }
        let isAllowed = team.gnId === caller.gnId;
        if (!isAllowed && this.prisma.profileAssignment?.findFirst) {
          const assign = await this.prisma.profileAssignment.findFirst({
            where: {
              profileId: caller.userId,
              gnId: team.gnId,
              validTo: null,
            },
          });
          if (assign) isAllowed = true;
        }
        if (!isAllowed && (this.prisma as any).accountAssignment?.findFirst) {
          const assign = await (this.prisma as any).accountAssignment.findFirst({
            where: {
              profileId: caller.userId,
              gnId: team.gnId,
              status: 'active',
            },
          });
          if (assign) isAllowed = true;
        }
        if (!isAllowed) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE',
            message:
              'Cannot view statistics for a team outside your GN division',
          });
        }
      }
    } else if (caller.role === UserRole.sda) {
      if (targetAreaType === 'national' || targetAreaType === 'district') {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: 'SDA can only view statistics within their DS division',
        });
      }
      if (targetAreaType === 'ds' && targetAreaId !== caller.dsId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: 'Cannot view statistics for another DS division',
        });
      }
      if (targetAreaType === 'gn') {
        const gn = await this.prisma.gnDivision.findUnique({
          where: { id: targetAreaId },
          select: { dsId: true },
        });
        if (!gn || gn.dsId !== caller.dsId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE',
            message:
              'Cannot view statistics for a GN division outside your DS division',
          });
        }
      }
      if (targetAreaType === 'team') {
        const team = await this.prisma.team.findUnique({
          where: { id: targetAreaId },
          select: { gn: { select: { dsId: true } } },
        });
        if (!team || team.gn?.dsId !== caller.dsId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE',
            message:
              'Cannot view statistics for a team outside your DS division',
          });
        }
      }
    } else if (caller.role === UserRole.dc) {
      if (targetAreaType === 'national') {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: 'DC can only view statistics within their District',
        });
      }
      if (targetAreaType === 'district' && targetAreaId !== caller.districtId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: 'Cannot view statistics for another District',
        });
      }
      if (targetAreaType === 'ds') {
        const ds = await this.prisma.divisionalSecretariat.findUnique({
          where: { id: targetAreaId },
          select: { districtId: true },
        });
        if (!ds || ds.districtId !== caller.districtId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE',
            message:
              'Cannot view statistics for a DS division outside your District',
          });
        }
      }
      if (targetAreaType === 'gn') {
        const gn = await this.prisma.gnDivision.findUnique({
          where: { id: targetAreaId },
          select: { ds: { select: { districtId: true } } },
        });
        if (!gn || gn.ds?.districtId !== caller.districtId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE',
            message:
              'Cannot view statistics for a GN division outside your District',
          });
        }
      }
      if (targetAreaType === 'team') {
        const team = await this.prisma.team.findUnique({
          where: { id: targetAreaId },
          select: { gn: { select: { ds: { select: { districtId: true } } } } },
        });
        if (!team || team.gn?.ds?.districtId !== caller.districtId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE',
            message: 'Cannot view statistics for a team outside your District',
          });
        }
      }
    }

    let summary: any = null;
    let refreshedAt: Date | null = null;

    if (targetAreaType === 'team') {
      const teamStat = await this.prisma.teamStat.findUnique({
        where: { teamId: targetAreaId },
      });
      if (teamStat) {
        refreshedAt = teamStat.refreshedAt;
        summary = {
          housesAssigned: teamStat.housesAssigned,
          housesStarted: teamStat.housesStarted,
          housesDone: teamStat.housesDone,
          clientsCount: teamStat.clientsCount,
          epfCount: teamStat.epfCount,
          etfCount: teamStat.etfCount,
          aswesumaCount: teamStat.aswesumaCount,
          samurdhiCount: teamStat.samurdhiCount,
          specialNeedsCount: teamStat.specialNeedsCount,
        };
      }
    } else {
      const areaStat = await this.prisma.areaStat.findUnique({
        where: {
          areaType_areaId: {
            areaType: targetAreaType,
            areaId: targetAreaId,
          },
        },
      });
      if (areaStat) {
        refreshedAt = areaStat.refreshedAt;
        summary = {
          housesAssigned: areaStat.housesAssigned,
          housesStarted: areaStat.housesStarted,
          housesDone: areaStat.housesDone,
          clientsCount: areaStat.clientsCount,
          epfCount: areaStat.epfCount,
          etfCount: areaStat.etfCount,
          aswesumaCount: areaStat.aswesumaCount,
          samurdhiCount: areaStat.samurdhiCount,
          specialNeedsCount: areaStat.specialNeedsCount,
        };
      }
    }

    // Live data fallback if pre-aggregated stat row is missing or uninitialized while live data exists
    if (
      (!summary || (summary.housesAssigned === 0 && summary.clientsCount === 0)) &&
      this.prisma.household?.count
    ) {
      const whereHouseholds: any = { deletedAt: null };
      const whereClients: any = { deletedAt: null, duplicateOf: null };

      if (targetAreaType === 'team') {
        whereHouseholds.teamId = targetAreaId;
        whereClients.teamId = targetAreaId;
      } else if (targetAreaType === 'gn') {
        whereHouseholds.gnId = targetAreaId;
        whereClients.gnId = targetAreaId;
      } else if (targetAreaType === 'ds') {
        whereHouseholds.dsId = targetAreaId;
        whereClients.dsId = targetAreaId;
      } else if (targetAreaType === 'district') {
        whereHouseholds.districtId = targetAreaId;
        whereClients.districtId = targetAreaId;
      }

      try {
        const liveHouses = await this.prisma.household.count({
          where: whereHouseholds,
        });
        const liveClients = this.prisma.client?.count
          ? await this.prisma.client.count({ where: whereClients })
          : 0;

        if (liveHouses > 0 || liveClients > 0) {
          const liveDone = await this.prisma.household.count({
            where: {
              ...whereHouseholds,
              OR: [{ visitStatus: 'completed' }, { finishedAt: { not: null } }],
            },
          });
          const liveStarted = await this.prisma.household.count({
            where: {
              ...whereHouseholds,
              OR: [
                { visitStatus: { in: ['in_progress', 'completed'] } },
                { finishedAt: { not: null } },
                { clients: { some: { deletedAt: null, duplicateOf: null } } },
              ],
            },
          });

          let epfCount = 0;
          let etfCount = 0;
          let aswesumaCount = 0;
          let samurdhiCount = 0;
          let specialNeedsCount = 0;

          if (this.prisma.client?.count) {
            [
              epfCount,
              etfCount,
              aswesumaCount,
              samurdhiCount,
              specialNeedsCount,
            ] = await Promise.all([
              this.prisma.client.count({ where: { ...whereClients, isEpf: true } }),
              this.prisma.client.count({ where: { ...whereClients, isEtf: true } }),
              this.prisma.client.count({
                where: { ...whereClients, isAswesuma: true },
              }),
              this.prisma.client.count({
                where: { ...whereClients, isSamurdhi: true },
              }),
              this.prisma.client.count({
                where: { ...whereClients, hasSpecialNeeds: true },
              }),
            ]);
          }

          summary = {
            housesAssigned: liveHouses,
            housesStarted: liveStarted,
            housesDone: liveDone,
            clientsCount: liveClients,
            epfCount,
            etfCount,
            aswesumaCount,
            samurdhiCount,
            specialNeedsCount,
          };
          refreshedAt = new Date();
        }
      } catch { }
    }

    if (!summary) {
      summary = {
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

    summary.completionRate =
      summary.housesAssigned > 0
        ? Math.round((summary.housesDone / summary.housesAssigned) * 1000) / 10
        : 0;

    const breakdown: any[] = [];
    if (targetAreaType === 'national') {
      const districts = await this.prisma.district.findMany({
        orderBy: { nameEn: 'asc' },
      });
      const districtStats = await this.prisma.areaStat.findMany({
        where: { areaType: 'district' },
      });
      const statMap = new Map(districtStats.map((s) => [s.areaId, s]));

      let liveAssignedByDist = new Map<string, number>();
      let liveDoneByDist = new Map<string, number>();
      let liveStartedByDist = new Map<string, number>();
      let liveClientsByDist = new Map<string, number>();

      if (
        this.prisma.household?.groupBy &&
        (!districtStats.length || districtStats.every((s) => s.housesAssigned === 0))
      ) {
        try {
          const [assignedGroups, doneGroups, startedGroups, clientGroups] =
            await Promise.all([
              this.prisma.household.groupBy({
                by: ['districtId'],
                where: { deletedAt: null },
                _count: { id: true },
              }),
              this.prisma.household.groupBy({
                by: ['districtId'],
                where: {
                  deletedAt: null,
                  OR: [{ visitStatus: 'completed' }, { finishedAt: { not: null } }],
                },
                _count: { id: true },
              }),
              this.prisma.household.groupBy({
                by: ['districtId'],
                where: {
                  deletedAt: null,
                  OR: [
                    { visitStatus: { in: ['in_progress', 'completed'] } },
                    { finishedAt: { not: null } },
                    { clients: { some: { deletedAt: null, duplicateOf: null } } },
                  ],
                },
                _count: { id: true },
              }),
              this.prisma.client?.groupBy
                ? this.prisma.client.groupBy({
                  by: ['districtId'],
                  where: { deletedAt: null, duplicateOf: null },
                  _count: { id: true },
                })
                : Promise.resolve([]),
            ]);
          for (const g of assignedGroups) liveAssignedByDist.set(g.districtId, g._count.id);
          for (const g of doneGroups) liveDoneByDist.set(g.districtId, g._count.id);
          for (const g of startedGroups) liveStartedByDist.set(g.districtId, g._count.id);
          for (const g of clientGroups) liveClientsByDist.set(g.districtId, g._count.id);
        } catch { }
      }

      for (const d of districts) {
        const s = statMap.get(d.id);
        const housesAssigned = s?.housesAssigned || liveAssignedByDist.get(d.id) || 0;
        const housesStarted = s?.housesStarted || liveStartedByDist.get(d.id) || 0;
        const housesDone = s?.housesDone || liveDoneByDist.get(d.id) || 0;
        const clientsCount = s?.clientsCount || liveClientsByDist.get(d.id) || 0;
        breakdown.push({
          id: d.id,
          name: d.nameEn,
          nameSi: d.nameSi,
          nameTa: d.nameTa,
          housesAssigned,
          housesStarted,
          housesDone,
          clientsCount,
          completionRate:
            housesAssigned > 0
              ? Math.round((housesDone / housesAssigned) * 1000) / 10
              : 0,
        });
      }
    } else if (targetAreaType === 'district') {
      const dsList = await this.prisma.divisionalSecretariat.findMany({
        where: { districtId: targetAreaId },
        orderBy: { nameEn: 'asc' },
      });
      const dsStats = await this.prisma.areaStat.findMany({
        where: { areaType: 'ds', areaId: { in: dsList.map((ds) => ds.id) } },
      });
      const statMap = new Map(dsStats.map((s) => [s.areaId, s]));


      let liveAssignedByDs = new Map<string, number>();
      let liveDoneByDs = new Map<string, number>();
      let liveStartedByDs = new Map<string, number>();
      let liveClientsByDs = new Map<string, number>();

      if (
        this.prisma.household?.groupBy &&
        (!dsStats.length || dsStats.every((s) => s.housesAssigned === 0))
      ) {
        try {
          const [assignedGroups, doneGroups, startedGroups, clientGroups] =
            await Promise.all([
              this.prisma.household.groupBy({
                by: ['dsId'],
                where: { districtId: targetAreaId, deletedAt: null },
                _count: { id: true },
              }),
              this.prisma.household.groupBy({
                by: ['dsId'],
                where: {
                  districtId: targetAreaId,
                  deletedAt: null,
                  OR: [{ visitStatus: 'completed' }, { finishedAt: { not: null } }],
                },
                _count: { id: true },
              }),
              this.prisma.household.groupBy({
                by: ['dsId'],
                where: {
                  districtId: targetAreaId,
                  deletedAt: null,
                  OR: [
                    { visitStatus: { in: ['in_progress', 'completed'] } },
                    { finishedAt: { not: null } },
                    { clients: { some: { deletedAt: null, duplicateOf: null } } },
                  ],
                },
                _count: { id: true },
              }),
              this.prisma.client?.groupBy
                ? this.prisma.client.groupBy({
                  by: ['dsId'],
                  where: { districtId: targetAreaId, deletedAt: null, duplicateOf: null },
                  _count: { id: true },
                })
                : Promise.resolve([]),
            ]);
          for (const g of assignedGroups) liveAssignedByDs.set(g.dsId, g._count.id);
          for (const g of doneGroups) liveDoneByDs.set(g.dsId, g._count.id);
          for (const g of startedGroups) liveStartedByDs.set(g.dsId, g._count.id);
          for (const g of clientGroups) liveClientsByDs.set(g.dsId, g._count.id);
        } catch { }
      }

      for (const ds of dsList) {
        const s = statMap.get(ds.id);
        const housesAssigned = s?.housesAssigned || liveAssignedByDs.get(ds.id) || 0;
        const housesStarted = s?.housesStarted || liveStartedByDs.get(ds.id) || 0;
        const housesDone = s?.housesDone || liveDoneByDs.get(ds.id) || 0;
        const clientsCount = s?.clientsCount || liveClientsByDs.get(ds.id) || 0;
        breakdown.push({
          id: ds.id,
          name: ds.nameEn,
          nameSi: ds.nameSi,
          nameTa: ds.nameTa,
          housesAssigned,
          housesStarted,
          housesDone,
          clientsCount,
          completionRate:
            housesAssigned > 0
              ? Math.round((housesDone / housesAssigned) * 1000) / 10
              : 0,
        });
      }
    } else if (targetAreaType === 'ds') {
      const gnList = await this.prisma.gnDivision.findMany({
        where: { dsId: targetAreaId },
        orderBy: { gnNumber: 'asc' },
      });
      const gnStats = await this.prisma.areaStat.findMany({
        where: { areaType: 'gn', areaId: { in: gnList.map((gn) => gn.id) } },
      });
      const statMap = new Map(gnStats.map((s) => [s.areaId, s]));


      let liveAssignedByGn = new Map<string, number>();
      let liveDoneByGn = new Map<string, number>();
      let liveStartedByGn = new Map<string, number>();
      let liveClientsByGn = new Map<string, number>();

      if (
        this.prisma.household?.groupBy &&
        (!gnStats.length || gnStats.every((s) => s.housesAssigned === 0))
      ) {
        try {
          const [assignedGroups, doneGroups, startedGroups, clientGroups] =
            await Promise.all([
              this.prisma.household.groupBy({
                by: ['gnId'],
                where: { dsId: targetAreaId, deletedAt: null },
                _count: { id: true },
              }),
              this.prisma.household.groupBy({
                by: ['gnId'],
                where: {
                  dsId: targetAreaId,
                  deletedAt: null,
                  OR: [{ visitStatus: 'completed' }, { finishedAt: { not: null } }],
                },
                _count: { id: true },
              }),
              this.prisma.household.groupBy({
                by: ['gnId'],
                where: {
                  dsId: targetAreaId,
                  deletedAt: null,
                  OR: [
                    { visitStatus: { in: ['in_progress', 'completed'] } },
                    { finishedAt: { not: null } },
                    { clients: { some: { deletedAt: null, duplicateOf: null } } },
                  ],
                },
                _count: { id: true },
              }),
              this.prisma.client?.groupBy
                ? this.prisma.client.groupBy({
                  by: ['gnId'],
                  where: { dsId: targetAreaId, deletedAt: null, duplicateOf: null },
                  _count: { id: true },
                })
                : Promise.resolve([]),
            ]);
          for (const g of assignedGroups) liveAssignedByGn.set(g.gnId, g._count.id);
          for (const g of doneGroups) liveDoneByGn.set(g.gnId, g._count.id);
          for (const g of startedGroups) liveStartedByGn.set(g.gnId, g._count.id);
          for (const g of clientGroups) liveClientsByGn.set(g.gnId, g._count.id);
        } catch { }
      }

      for (const gn of gnList) {
        const s = statMap.get(gn.id);
        const housesAssigned = s?.housesAssigned || liveAssignedByGn.get(gn.id) || 0;
        const housesStarted = s?.housesStarted || liveStartedByGn.get(gn.id) || 0;
        const housesDone = s?.housesDone || liveDoneByGn.get(gn.id) || 0;
        const clientsCount = s?.clientsCount || liveClientsByGn.get(gn.id) || 0;
        breakdown.push({
          id: gn.id,
          name: `${gn.gnNumber} - ${gn.gnName}`,
          gnNumber: gn.gnNumber,
          housesAssigned,
          housesStarted,
          housesDone,
          clientsCount,
          completionRate:
            housesAssigned > 0
              ? Math.round((housesDone / housesAssigned) * 1000) / 10
              : 0,
        });
      }
    } else if (targetAreaType === 'gn') {
      const teams = await this.prisma.team.findMany({
        where: { gnId: targetAreaId },
        orderBy: { teamNo: 'asc' },
      });
      const teamStats = await this.prisma.teamStat.findMany({
        where: { gnId: targetAreaId },
      });
      const statMap = new Map(teamStats.map((s) => [s.teamId, s]));


      let liveAssignedByTeam = new Map<string, number>();
      let liveDoneByTeam = new Map<string, number>();
      let liveStartedByTeam = new Map<string, number>();
      let liveClientsByTeam = new Map<string, number>();

      if (
        this.prisma.household?.groupBy &&
        (!teamStats.length || teamStats.every((s) => s.housesAssigned === 0))
      ) {
        try {
          const [assignedGroups, doneGroups, startedGroups, clientGroups] =
            await Promise.all([
              this.prisma.household.groupBy({
                by: ['teamId'],
                where: { gnId: targetAreaId, deletedAt: null },
                _count: { id: true },
              }),
              this.prisma.household.groupBy({
                by: ['teamId'],
                where: {
                  gnId: targetAreaId,
                  deletedAt: null,
                  OR: [{ visitStatus: 'completed' }, { finishedAt: { not: null } }],
                },
                _count: { id: true },
              }),
              this.prisma.household.groupBy({
                by: ['teamId'],
                where: {
                  gnId: targetAreaId,
                  deletedAt: null,
                  OR: [
                    { visitStatus: { in: ['in_progress', 'completed'] } },
                    { finishedAt: { not: null } },
                    { clients: { some: { deletedAt: null, duplicateOf: null } } },
                  ],
                },
                _count: { id: true },
              }),
              this.prisma.client?.groupBy
                ? this.prisma.client.groupBy({
                  by: ['teamId'],
                  where: { gnId: targetAreaId, deletedAt: null, duplicateOf: null },
                  _count: { id: true },
                })
                : Promise.resolve([]),
            ]);
          for (const g of assignedGroups) if (g.teamId) liveAssignedByTeam.set(g.teamId, g._count.id);
          for (const g of doneGroups) if (g.teamId) liveDoneByTeam.set(g.teamId, g._count.id);
          for (const g of startedGroups) if (g.teamId) liveStartedByTeam.set(g.teamId, g._count.id);
          for (const g of clientGroups) if (g.teamId) liveClientsByTeam.set(g.teamId, g._count.id);
        } catch { }
      }

      for (const t of teams) {
        const s = statMap.get(t.id);
        const housesAssigned = s?.housesAssigned || liveAssignedByTeam.get(t.id) || 0;
        const housesStarted = s?.housesStarted || liveStartedByTeam.get(t.id) || 0;
        const housesDone = s?.housesDone || liveDoneByTeam.get(t.id) || 0;
        const clientsCount = s?.clientsCount || liveClientsByTeam.get(t.id) || 0;
        breakdown.push({
          id: t.id,
          name: `Team ${t.teamNo}`,
          teamNo: t.teamNo,
          maxMembers: t.maxMembers,
          housesAssigned,
          housesStarted,
          housesDone,
          clientsCount,
          completionRate:
            housesAssigned > 0
              ? Math.round((housesDone / housesAssigned) * 1000) / 10
              : 0,
        });
      }

      // Check for unassigned households (pool) in this GN
      if (this.prisma.household?.count) {
        try {
          const unassignedHouses = await this.prisma.household.count({
            where: { gnId: targetAreaId, teamId: null, deletedAt: null },
          });
          if (unassignedHouses > 0) {
            const unassignedDone = await this.prisma.household.count({
              where: {
                gnId: targetAreaId,
                teamId: null,
                deletedAt: null,
                OR: [{ visitStatus: 'completed' }, { finishedAt: { not: null } }],
              },
            });
            const unassignedStarted = await this.prisma.household.count({
              where: {
                gnId: targetAreaId,
                teamId: null,
                deletedAt: null,
                OR: [
                  { visitStatus: { in: ['in_progress', 'completed'] } },
                  { finishedAt: { not: null } },
                  { clients: { some: { deletedAt: null, duplicateOf: null } } },
                ],
              },
            });
            const unassignedClients = this.prisma.client?.count
              ? await this.prisma.client.count({
                where: {
                  gnId: targetAreaId,
                  teamId: null,
                  deletedAt: null,
                  duplicateOf: null,
                },
              })
              : 0;

            breakdown.push({
              id: 'unassigned',
              name: 'Unassigned Households (Pool)',
              teamNo: 0,
              maxMembers: 0,
              housesAssigned: unassignedHouses,
              housesStarted: unassignedStarted,
              housesDone: unassignedDone,
              clientsCount: unassignedClients,
              completionRate:
                unassignedHouses > 0
                  ? Math.round((unassignedDone / unassignedHouses) * 1000) / 10
                  : 0,
            });
          } else if (teams.length === 0) {
            const gnInfo = await this.prisma.gnDivision.findUnique({
              where: { id: targetAreaId },
              select: { gnNumber: true, gnName: true },
            });
            breakdown.push({
              id: targetAreaId,
              name: gnInfo ? `${gnInfo.gnNumber} - ${gnInfo.gnName} (General)` : 'GN Division (General)',
              teamNo: 0,
              maxMembers: 0,
              housesAssigned: 0,
              housesStarted: 0,
              housesDone: 0,
              clientsCount: 0,
              completionRate: 0,
            });
          }
        } catch { }
      }
    }

    const dirtyWhere: any = { statsDirtyAt: { not: null } };
    if (caller.role === UserRole.cdc_secretary && caller.gnId) {
      dirtyWhere.gnId = caller.gnId;
    } else if (caller.role === UserRole.sda && caller.dsId) {
      dirtyWhere.gn = { dsId: caller.dsId };
    } else if (caller.role === UserRole.dc && caller.districtId) {
      dirtyWhere.gn = { ds: { districtId: caller.districtId } };
    }
    const dirtyTeamsCount = await this.prisma.team.count({ where: dirtyWhere });

    return {
      areaType: targetAreaType,
      areaId: targetAreaId,
      summary,
      breakdown,
      dirtyTeamsCount,
      refreshedAt: refreshedAt ? refreshedAt.toISOString() : null,
    };
  }
}
