import { Test, TestingModule } from '@nestjs/testing';
import { StatsService } from './stats.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope/scope.service';
import { UserRole } from '../common/scope/scope.types';
import type { ScopeContext } from '../common/scope/scope.types';

describe('StatsService (M5.6 & M5.7)', () => {
  let service: StatsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      teamStat: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      areaStat: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      district: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      divisionalSecretariat: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      gnDivision: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      team: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatsService,
        { provide: PrismaService, useValue: prisma },
        ScopeService,
      ],
    }).compile();

    service = module.get<StatsService>(StatsService);
  });

  it('returns progress stats matching summary numbers for super_admin (national scope)', async () => {
    const caller: ScopeContext = {
      userId: 'admin-uuid',
      role: UserRole.super_admin,
    };

    prisma.areaStat.findUnique.mockResolvedValueOnce({
      areaType: 'national',
      areaId: 'national',
      housesAssigned: 100,
      housesStarted: 60,
      housesDone: 40,
      clientsCount: 120,
      epfCount: 30,
      etfCount: 25,
      aswesumaCount: 15,
      samurdhiCount: 10,
      specialNeedsCount: 5,
      refreshedAt: new Date('2026-11-02T10:00:00Z'),
    });

    const result = await service.getProgress(caller);
    expect(result.areaType).toBe('national');
    expect(result.summary.housesAssigned).toBe(100);
    expect(result.summary.housesDone).toBe(40);
    expect(result.summary.completionRate).toBe(40.0);
    expect(result.summary.clientsCount).toBe(120);
    expect(result.dirtyTeamsCount).toBe(0);
  });

  it('rejects unknown areaType with BadRequestException instead of returning zeros', async () => {
    const caller: ScopeContext = {
      userId: 'admin-uuid',
      role: UserRole.super_admin,
    };

    await expect(
      service.getProgress(caller, { areaType: 'unknown_type', areaId: 'foo' }),
    ).rejects.toMatchObject({
      response: {
        code: 'INVALID_AREA_TYPE',
      },
    });
  });

  it('rejects cross-GN progress query for cdc_secretary', async () => {
    const caller: ScopeContext = {
      userId: 'sec-uuid',
      role: UserRole.cdc_secretary,
      gnId: 'gn-1111',
    };

    await expect(
      service.getProgress(caller, { areaType: 'gn', areaId: 'gn-9999' }),
    ).rejects.toThrow();
  });

  it('returns null refreshedAt when no stats row exists', async () => {
    const caller: ScopeContext = {
      userId: 'admin-uuid',
      role: UserRole.super_admin,
    };
    prisma.areaStat.findUnique.mockResolvedValueOnce(null);

    const result = await service.getProgress(caller);
    expect(result.summary.housesAssigned).toBe(0);
    expect(result.refreshedAt).toBeNull();
  });

  it('restricts team_member strictly to their own team', async () => {
    const caller: ScopeContext = {
      userId: 'tm-uuid',
      role: UserRole.team_member,
      teamId: 'team-own',
    };

    // Cannot query national
    await expect(
      service.getProgress(caller, { areaType: 'national', areaId: 'national' }),
    ).rejects.toThrow();

    // Cannot query other team
    await expect(
      service.getProgress(caller, { areaType: 'team', areaId: 'team-other' }),
    ).rejects.toThrow();

    // Can query own team
    prisma.teamStat.findUnique.mockResolvedValueOnce({
      teamId: 'team-own',
      housesAssigned: 10,
      housesStarted: 5,
      housesDone: 2,
      clientsCount: 8,
      epfCount: 1,
      etfCount: 1,
      aswesumaCount: 0,
      samurdhiCount: 0,
      specialNeedsCount: 0,
      refreshedAt: new Date('2026-11-02T10:00:00Z'),
    });
    const res = await service.getProgress(caller, {
      areaType: 'team',
      areaId: 'team-own',
    });
    expect(res.areaId).toBe('team-own');
  });

  it('rejects cdc_secretary for team outside their GN division', async () => {
    const caller: ScopeContext = {
      userId: 'sec-uuid',
      role: UserRole.cdc_secretary,
      gnId: 'gn-1111',
    };

    prisma.team.findUnique.mockResolvedValueOnce({ gnId: 'gn-2222' });

    await expect(
      service.getProgress(caller, { areaType: 'team', areaId: 'team-other' }),
    ).rejects.toThrow();
  });

  it('rejects sda for GN or team outside their DS division', async () => {
    const caller: ScopeContext = {
      userId: 'sda-uuid',
      role: UserRole.sda,
      dsId: 'ds-1111',
    };

    prisma.gnDivision.findUnique.mockResolvedValueOnce({ dsId: 'ds-2222' });
    await expect(
      service.getProgress(caller, { areaType: 'gn', areaId: 'gn-other' }),
    ).rejects.toThrow();

    prisma.team.findUnique.mockResolvedValueOnce({ gn: { dsId: 'ds-2222' } });
    await expect(
      service.getProgress(caller, { areaType: 'team', areaId: 'team-other' }),
    ).rejects.toThrow();
  });

  it('rejects dc for DS, GN, or team outside their District', async () => {
    const caller: ScopeContext = {
      userId: 'dc-uuid',
      role: UserRole.dc,
      districtId: 'dist-1111',
    };

    prisma.divisionalSecretariat.findUnique.mockResolvedValueOnce({
      districtId: 'dist-2222',
    });
    await expect(
      service.getProgress(caller, { areaType: 'ds', areaId: 'ds-other' }),
    ).rejects.toThrow();

    prisma.gnDivision.findUnique.mockResolvedValueOnce({
      ds: { districtId: 'dist-2222' },
    });
    await expect(
      service.getProgress(caller, { areaType: 'gn', areaId: 'gn-other' }),
    ).rejects.toThrow();

    prisma.team.findUnique.mockResolvedValueOnce({
      gn: { ds: { districtId: 'dist-2222' } },
    });
    await expect(
      service.getProgress(caller, { areaType: 'team', areaId: 'team-other' }),
    ).rejects.toThrow();
  });
});
