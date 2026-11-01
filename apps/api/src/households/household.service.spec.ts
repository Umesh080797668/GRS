import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { HouseholdService } from './household.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope/scope.service';
import { UserRole, ScopeContext } from '../common/scope/scope.types';

describe('HouseholdService (M4.1, M4.2, Milestone 4 Invariants)', () => {
  let service: HouseholdService;

  const mockGnId = '11111111-1111-1111-1111-111111111111';
  const mockOtherGnId = '22222222-2222-2222-2222-222222222222';
  const mockTeamId = '33333333-3333-3333-3333-333333333333';
  const mockOtherTeamId = '44444444-4444-4444-4444-444444444444';
  const mockDsId = '55555555-5555-5555-5555-555555555555';
  const mockDistrictId = '66666666-6666-6666-6666-666666666666';

  const cdcSecretaryScope: ScopeContext = {
    userId: 'user-cdc-sec',
    role: UserRole.cdc_secretary,
    districtId: mockDistrictId,
    dsId: mockDsId,
    gnId: mockGnId,
    teamId: mockTeamId,
  };

  const superAdminScope: ScopeContext = {
    userId: 'user-super-admin',
    role: UserRole.super_admin,
  };

  // In-memory test store
  let mockHouseholds: any[] = [];
  let gnNextSerial = 1;
  let mockClients: any[] = [];

  const mockPrisma: any = {
    gnDivision: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === mockGnId) {
          return Promise.resolve({
            id: mockGnId,
            gnNumber: '101A',
            gnName: 'Kaduwela North',
            dsId: mockDsId,
            nextSerial: gnNextSerial,
            ds: { id: mockDsId, districtId: mockDistrictId },
          });
        }
        return Promise.resolve(null);
      }),
    },
    team: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === mockTeamId) {
          return Promise.resolve({
            id: mockTeamId,
            teamNo: 1,
            gnId: mockGnId,
            gn: { id: mockGnId },
          });
        }
        if (where.id === mockOtherTeamId) {
          return Promise.resolve({
            id: mockOtherTeamId,
            teamNo: 2,
            gnId: mockGnId,
            gn: { id: mockGnId },
          });
        }
        return Promise.resolve(null);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        return Promise.resolve({ id: where.id, ...data });
      }),
    },
    household: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        const found = mockHouseholds.find(
          (h) =>
            h.gnId === where.gnId &&
            h.houseNoNorm === where.houseNoNorm &&
            (where.deletedAt === null ? h.deletedAt === null : true) &&
            (where.id?.not ? h.id !== where.id.not : true),
        );
        return Promise.resolve(found || null);
      }),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const found = mockHouseholds.find((h) => h.id === where.id);
        return Promise.resolve(found || null);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        let results = [...mockHouseholds];
        if (where.gnId) results = results.filter((h) => h.gnId === where.gnId);
        if (where.teamId !== undefined)
          results = results.filter((h) => h.teamId === where.teamId);
        if (where.deletedAt === null)
          results = results.filter((h) => h.deletedAt === null);
        if (where.id?.in) {
          const idSet = new Set(where.id.in);
          results = results.filter((h) => idSet.has(h.id));
        }
        return Promise.resolve(results);
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        const row = {
          id: `house-${mockHouseholds.length + 1}`,
          ...data,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          deletedReason: null,
        };
        mockHouseholds.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const index = mockHouseholds.findIndex((h) => h.id === where.id);
        if (index === -1) throw new Error('Not found');
        const updated = {
          ...mockHouseholds[index],
          ...data,
          version: data.version?.increment
            ? mockHouseholds[index].version + 1
            : mockHouseholds[index].version,
          updatedAt: new Date(),
        };
        mockHouseholds[index] = updated;
        return Promise.resolve(updated);
      }),
      count: jest.fn().mockImplementation(({ where }) => {
        let results = [...mockHouseholds];
        if (where.gnId) results = results.filter((h) => h.gnId === where.gnId);
        if (where.deletedAt === null)
          results = results.filter((h) => h.deletedAt === null);
        return Promise.resolve(results.length);
      }),
    },
    client: {
      count: jest.fn().mockImplementation(({ where }) => {
        const count = mockClients.filter(
          (c) => c.householdId === where.householdId,
        ).length;
        return Promise.resolve(count);
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    householdUnassignment: {
      create: jest.fn().mockResolvedValue({ id: 'mock-unassign-id' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn().mockImplementation(async (cb) => {
      // Mock transaction executor with queryRawUnsafe for serial locks and batch updates
      const tx = {
        ...mockPrisma,
        $queryRawUnsafe: jest.fn().mockImplementation((query: string, ...args: any[]) => {
          if (query.includes('SELECT next_serial FROM gn_divisions')) {
            const current = gnNextSerial;
            return Promise.resolve([{ next_serial: current }]);
          }
          if (query.includes('UPDATE gn_divisions SET next_serial')) {
            gnNextSerial++;
            return Promise.resolve({ count: 1 });
          }
          if (query.includes('UPDATE households') && query.includes('SET team_id')) {
            const targetTeamId = args[0];
            const requestedHouseIds = args[1] as string[];
            const gnId = args[2];

            const updatedIds: Array<{ id: string }> = [];
            for (const house of mockHouseholds) {
              if (
                requestedHouseIds.includes(house.id) &&
                house.gnId === gnId &&
                house.teamId === null &&
                house.deletedAt === null
              ) {
                house.teamId = targetTeamId;
                house.version += 1;
                updatedIds.push({ id: house.id });
              }
            }
            return Promise.resolve(updatedIds);
          }
          if (query.includes('UPDATE clients SET team_id')) {
            return Promise.resolve({ count: 1 });
          }
          if (query.includes('UPDATE teams SET stats_dirty_at')) {
            return Promise.resolve({ count: 1 });
          }
          return Promise.resolve([]);
        }),
      };
      const run = async () => {
        await lockQueue;
        const snapshot = JSON.stringify(mockHouseholds);
        const nextSerialSnapshot = gnNextSerial;
        try {
          return await cb(tx);
        } catch (err) {
          mockHouseholds = JSON.parse(snapshot);
          gnNextSerial = nextSerialSnapshot;
          throw err;
        }
      };
      const p = run();
      lockQueue = p.then(
        () => { },
        () => { },
      );
      return p;
    }),
  };

  let lockQueue = Promise.resolve();

  beforeEach(async () => {
    mockHouseholds = [];
    gnNextSerial = 1;
    mockClients = [];
    lockQueue = Promise.resolve();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdService,
        { provide: PrismaService, useValue: mockPrisma },
        ScopeService,
      ],
    }).compile();

    service = module.get<HouseholdService>(HouseholdService);
  });

  describe('M4.1: House CRUD API with serial allocation & soft delete rules (C6)', () => {
    it('allocates sequential serial numbers under concurrent creation: 50 concurrent creates give 50 unique serials (M4.1 Done When)', async () => {
      // Concurrently create 50 households
      const createPromises = Array.from({ length: 50 }, (_, i) =>
        service.createHousehold(cdcSecretaryScope, {
          gnId: mockGnId,
          houseNo: `H-${i + 1}`,
          houseLeaderName: `House Leader ${i + 1}`,
          address: `Address ${i + 1}`,
          targetFemale: 1,
          targetMale: 1,
          isAswesuma: i % 2 === 0,
        }),
      );

      const results = await Promise.all(createPromises);

      expect(results.length).toBe(50);
      const serials = results.map((r) => r.serialNo);
      const uniqueSerials = new Set(serials);

      // Verify all 50 serials are completely unique
      expect(uniqueSerials.size).toBe(50);
      expect(Math.min(...serials)).toBe(1);
      expect(Math.max(...serials)).toBe(50);
    });

    it('rejects duplicate house number within the same GN division', async () => {
      await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '25/A',
        houseLeaderName: 'Leader Original',
      });

      // Normalization handles ' 025/a ' -> '25/A'
      await expect(
        service.createHousehold(cdcSecretaryScope, {
          gnId: mockGnId,
          houseNo: ' 025/a ',
          houseLeaderName: 'Leader Duplicate',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('prevents CDC Secretary from creating a household outside their assigned GN division', async () => {
      await expect(
        service.createHousehold(cdcSecretaryScope, {
          gnId: mockOtherGnId,
          houseNo: '99',
          houseLeaderName: 'Out of scope',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Decision C6: blocks soft delete if clients exist on the household', async () => {
      const house = await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '100',
        houseLeaderName: 'Leader C6',
      });

      // Attach client
      mockClients.push({ id: 'client-1', householdId: house.id });

      await expect(
        service.deleteHousehold(cdcSecretaryScope, house.id),
      ).rejects.toThrow(ConflictException);

      // Verify house was NOT deleted
      const check = await service.getHouseholdById(cdcSecretaryScope, house.id);
      expect(check.deletedAt).toBeNull();
    });

    it('Decision C6: permits soft delete when no clients exist', async () => {
      const house = await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '101',
        houseLeaderName: 'Leader Empty',
      });

      const res = await service.deleteHousehold(cdcSecretaryScope, house.id, {
        reason: 'Demolished',
      });

      expect(res.success).toBe(true);
      expect(mockHouseholds.find((h) => h.id === house.id)?.deletedAt).toBeDefined();
    });

    it('corrects household pre-visit data and bumps version', async () => {
      const house = await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '102',
        houseLeaderName: 'Old Leader',
      });

      const updated = await service.updateHousehold(cdcSecretaryScope, house.id, {
        houseLeaderName: 'New Leader',
        isAswesuma: true,
      });

      expect(updated.houseLeaderName).toBe('New Leader');
      expect(updated.isAswesuma).toBe(true);
      expect(updated.version).toBe(2);
    });
  });

  describe('M4.2: Team house selection endpoint (§8.4) & unassign rules', () => {
    it('race-safe assignment: two leaders claiming same house - exactly one wins; the other gets 409 + list (M4.2 Done When)', async () => {
      const house1 = await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '201',
        houseLeaderName: 'Leader 201',
      });
      const house2 = await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '202',
        houseLeaderName: 'Leader 202',
      });

      // Leader 1 claims house 1 & 2
      const claim1 = await service.assignHousesToTeam(
        cdcSecretaryScope,
        mockTeamId,
        [house1.id, house2.id],
      );
      expect(claim1.success).toBe(true);
      expect(claim1.assignedCount).toBe(2);

      // Leader 2 attempts to claim house 2 & a new house 3
      const house3 = await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '203',
        houseLeaderName: 'Leader 203',
      });

      const otherLeaderScope: ScopeContext = {
        ...cdcSecretaryScope,
        userId: 'user-leader-2',
        teamId: mockOtherTeamId,
      };

      try {
        await service.assignHousesToTeam(otherLeaderScope, mockOtherTeamId, [
          house2.id,
          house3.id,
        ]);
        fail('Expected 409 ConflictException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ConflictException);
        expect(err.response.code).toBe('HOUSE_CLAIM_CONFLICT');
        expect(err.response.unavailableHouseIds).toContain(house2.id);
      }

      // Verify house 3 was rolled back and remains unassigned
      const house3Check = mockHouseholds.find((h) => h.id === house3.id);
      expect(house3Check.teamId).toBeNull();
    });

    it('unassigns a house only when no clients exist, otherwise blocks with 409', async () => {
      const house = await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '301',
        houseLeaderName: 'Leader 301',
      });

      await service.assignHousesToTeam(cdcSecretaryScope, mockTeamId, [house.id]);

      // 1. If clients exist, unassign MUST be blocked per §8.4
      mockClients.push({
        id: 'client-on-house-301',
        householdId: house.id,
        teamId: mockTeamId,
      });

      try {
        await service.unassignHouseFromTeam(
          cdcSecretaryScope,
          mockTeamId,
          house.id,
        );
        fail('Expected ConflictException when clients exist');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ConflictException);
        expect(err.response.code).toBe('HOUSEHOLD_HAS_CLIENTS');
      }

      // 2. When no clients exist, unassign succeeds
      mockClients = mockClients.filter((c) => c.householdId !== house.id);

      const unassign = await service.unassignHouseFromTeam(
        cdcSecretaryScope,
        mockTeamId,
        house.id,
      );

      expect(unassign.success).toBe(true);
      const houseCheck = mockHouseholds.find((h) => h.id === house.id);
      expect(houseCheck.teamId).toBeNull();
    });
  });
});
