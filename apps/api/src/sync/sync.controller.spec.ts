import { Test, TestingModule } from '@nestjs/testing';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { LookupService } from '../lookups/lookup.service';
import { UserRole } from '../common/scope/scope.types';
import type { ScopeContext } from '../common/scope/scope.types';

import { ScopeService } from '../common/scope/scope.service';
import { ForbiddenException } from '@nestjs/common';

describe('SyncController & SyncService (M2.7 Area Download)', () => {
  let controller: SyncController;
  let syncService: SyncService;

  const mockHouseholds = [
    {
      id: 'house-1',
      gnId: 'gn-1',
      teamId: 'team-1',
      districtId: 'dist-1',
      dsId: 'ds-1',
      serialNo: 1,
      houseNo: 'HN-01',
      houseNoNorm: 'HN-01',
      houseLeaderName: 'Leader 1',
      address: 'Address 1',
      villageName: 'Village 1',
      isEpf: false,
      isEtf: false,
      isAswesuma: false,
      isSamurdhi: false,
      hasSpecialNeeds: false,
      targetFemale: 1,
      targetMale: 1,
      ageGroupMin: 18,
      ageGroupMax: 35,
      langSinhala: true,
      langTamil: false,
      langEnglish: false,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'house-2',
      gnId: 'gn-1',
      teamId: 'team-1',
      districtId: 'dist-1',
      dsId: 'ds-1',
      serialNo: 2,
      houseNo: 'HN-02',
      houseNoNorm: 'HN-02',
      houseLeaderName: 'Leader 2',
      address: 'Address 2',
      villageName: 'Village 1',
      isEpf: false,
      isEtf: false,
      isAswesuma: false,
      isSamurdhi: false,
      hasSpecialNeeds: false,
      targetFemale: 1,
      targetMale: 1,
      ageGroupMin: 20,
      ageGroupMax: 40,
      langSinhala: true,
      langTamil: false,
      langEnglish: false,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const mockPrisma = {
    household: {
      findMany: jest.fn().mockResolvedValue(mockHouseholds),
      count: jest.fn().mockResolvedValue(2),
    },
  };

  const mockLookupService = {
    getCategorizedLookups: jest.fn().mockResolvedValue({
      version: 'v1',
      count: 10,
      categories: { gender: [{ code: 'M', labelEn: 'Male' }] },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [
        SyncService,
        ScopeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LookupService, useValue: mockLookupService },
      ],
    }).compile();

    controller = module.get<SyncController>(SyncController);
    syncService = module.get<SyncService>(SyncService);
  });

  it('should return initial paged area data with lookups and households', async () => {
    const user: ScopeContext = {
      userId: 'user-1',
      role: UserRole.team_member,
      teamId: 'team-1',
    };

    const result = await controller.downloadArea(user, { limit: 500 });
    expect(result).toBeDefined();
    expect(result.items.length).toBe(2);
    expect(result.total).toBe(2);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(result.lookups).toBeDefined();
    expect(result.items[0].houseNo).toBe('HN-01');
  });

  it('should support pagination cursor for resumable download', async () => {
    const user: ScopeContext = {
      userId: 'user-1',
      role: UserRole.team_member,
      teamId: 'team-1',
    };

    mockPrisma.household.findMany.mockResolvedValueOnce([mockHouseholds[1]]);

    const result = await controller.downloadArea(user, {
      cursor: 'house-1',
      limit: 1,
    });
    expect(result).toBeDefined();
    expect(result.items.length).toBe(1);
    expect(result.items[0].id).toBe('house-2');
  });

  it('FAILS CLOSED: throws ForbiddenException if user has no assigned team/scope', async () => {
    const unassignedUser: ScopeContext = {
      userId: 'user-rogue',
      role: UserRole.team_member,
      // No teamId, no gnId, no dsId, no districtId
    };

    await expect(
      controller.downloadArea(unassignedUser, { limit: 500 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('FAILS CLOSED: throws ForbiddenException if user role is missing or unauthorized', async () => {
    const rogueUser = {
      userId: 'user-rogue',
    } as any;

    await expect(
      controller.downloadArea(rogueUser, { limit: 500 }),
    ).rejects.toThrow(ForbiddenException);
  });
});
