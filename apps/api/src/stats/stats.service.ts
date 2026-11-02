import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope/scope.service';
import { ScopeContext, UserRole } from '../common/scope/scope.types';

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: ScopeService,
  ) { }

  async getProgress(
    caller: ScopeContext,
    query?: { areaType?: string; areaId?: string },
  ) {
    let targetAreaType = query?.areaType;
    let targetAreaId = query?.areaId;

    if (!targetAreaType || !targetAreaId) {
      if (caller.role === UserRole.team_member) {
        targetAreaType = 'team';
        targetAreaId = caller.teamId || '';
      } else if (caller.role === UserRole.cdc_secretary) {
        targetAreaType = 'gn';
        targetAreaId = caller.gnId || '';
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
    if (caller.role === UserRole.cdc_secretary) {
      if (targetAreaType !== 'gn' && targetAreaType !== 'team') {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message:
            'CDC Secretary can only view GN or team statistics within their GN division',
        });
      }
      if (targetAreaType === 'gn' && targetAreaId !== caller.gnId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: 'Cannot view statistics for another GN division',
        });
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
    }

    let summary: any = null;
    let refreshedAt = new Date();

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
      for (const d of districts) {
        const s = statMap.get(d.id);
        breakdown.push({
          id: d.id,
          name: d.nameEn,
          nameSi: d.nameSi,
          nameTa: d.nameTa,
          housesAssigned: s?.housesAssigned ?? 0,
          housesStarted: s?.housesStarted ?? 0,
          housesDone: s?.housesDone ?? 0,
          clientsCount: s?.clientsCount ?? 0,
          completionRate:
            s && s.housesAssigned > 0
              ? Math.round((s.housesDone / s.housesAssigned) * 1000) / 10
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
      for (const ds of dsList) {
        const s = statMap.get(ds.id);
        breakdown.push({
          id: ds.id,
          name: ds.nameEn,
          nameSi: ds.nameSi,
          nameTa: ds.nameTa,
          housesAssigned: s?.housesAssigned ?? 0,
          housesStarted: s?.housesStarted ?? 0,
          housesDone: s?.housesDone ?? 0,
          clientsCount: s?.clientsCount ?? 0,
          completionRate:
            s && s.housesAssigned > 0
              ? Math.round((s.housesDone / s.housesAssigned) * 1000) / 10
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
      for (const gn of gnList) {
        const s = statMap.get(gn.id);
        breakdown.push({
          id: gn.id,
          name: `${gn.gnNumber} - ${gn.gnName}`,
          gnNumber: gn.gnNumber,
          housesAssigned: s?.housesAssigned ?? 0,
          housesStarted: s?.housesStarted ?? 0,
          housesDone: s?.housesDone ?? 0,
          clientsCount: s?.clientsCount ?? 0,
          completionRate:
            s && s.housesAssigned > 0
              ? Math.round((s.housesDone / s.housesAssigned) * 1000) / 10
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
      for (const t of teams) {
        const s = statMap.get(t.id);
        breakdown.push({
          id: t.id,
          name: `Team ${t.teamNo}`,
          teamNo: t.teamNo,
          maxMembers: t.maxMembers,
          housesAssigned: s?.housesAssigned ?? 0,
          housesStarted: s?.housesStarted ?? 0,
          housesDone: s?.housesDone ?? 0,
          clientsCount: s?.clientsCount ?? 0,
          completionRate:
            s && s.housesAssigned > 0
              ? Math.round((s.housesDone / s.housesAssigned) * 1000) / 10
              : 0,
        });
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
      refreshedAt: refreshedAt.toISOString(),
    };
  }
}
