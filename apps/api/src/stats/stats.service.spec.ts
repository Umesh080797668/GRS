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
      },
      gnDivision: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      team: {
        findMany: jest.fn().mockResolvedValue([]),
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
});
