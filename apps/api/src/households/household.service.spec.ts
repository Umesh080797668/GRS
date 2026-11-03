import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
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
          visitStatus: data.visitStatus ?? 'not_started',
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
          (c) =>
            c.householdId === where.householdId &&
            (where.deletedAt === null ? !c.deletedAt : true),
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
        $queryRawUnsafe: jest
          .fn()
          .mockImplementation((query: string, ...args: any[]) => {
            if (query.includes('SELECT next_serial FROM gn_divisions')) {
              const current = gnNextSerial;
              return Promise.resolve([{ next_serial: current }]);
            }
            if (query.includes('UPDATE gn_divisions SET next_serial')) {
              gnNextSerial++;
              return Promise.resolve({ count: 1 });
            }
            if (
              query.includes('UPDATE households') &&
              query.includes('SET team_id')
            ) {
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
      expect(
        mockHouseholds.find((h) => h.id === house.id)?.deletedAt,
      ).toBeDefined();
    });

    it('Decision C6: permits soft delete when attached clients are already soft-deleted', async () => {
      const house = await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '101-SD',
        houseLeaderName: 'Leader SoftDeleted Client',
      });

      // Attach client that is soft-deleted
      mockClients.push({
        id: 'client-soft-deleted',
        householdId: house.id,
        deletedAt: new Date(),
      });

      const res = await service.deleteHousehold(cdcSecretaryScope, house.id, {
        reason: 'Demolished with soft deleted clients',
      });

      expect(res.success).toBe(true);
      expect(
        mockHouseholds.find((h) => h.id === house.id)?.deletedAt,
      ).toBeDefined();
    });

    it('validates hierarchy (district, DS, team) against GN division', async () => {
      // Invalid district
      await expect(
        service.createHousehold(cdcSecretaryScope, {
          gnId: mockGnId,
          houseNo: '101-B',
          houseLeaderName: 'Bad District',
          districtId: 'wrong-district-uuid',
        }),
      ).rejects.toThrow();

      // Invalid DS
      await expect(
        service.createHousehold(cdcSecretaryScope, {
          gnId: mockGnId,
          houseNo: '101-C',
          houseLeaderName: 'Bad DS',
          dsId: 'wrong-ds-uuid',
        }),
      ).rejects.toThrow();

      // Invalid Team (wrong GN)
      await expect(
        service.createHousehold(cdcSecretaryScope, {
          gnId: mockGnId,
          houseNo: '101-D',
          houseLeaderName: 'Bad Team',
          teamId: 'non-existent-team',
        }),
      ).rejects.toThrow();
    });

    it('corrects household pre-visit data and bumps version', async () => {
      const house = await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '102',
        houseLeaderName: 'Old Leader',
      });

      const updated = await service.updateHousehold(
        cdcSecretaryScope,
        house.id,
        {
          houseLeaderName: 'New Leader',
          isAswesuma: true,
        },
      );

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

      await service.assignHousesToTeam(cdcSecretaryScope, mockTeamId, [
        house.id,
      ]);

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

    it('assignHousesToTeam: repeated house IDs are deduplicated and do not cause false 409', async () => {
      const house = await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '401',
        houseLeaderName: 'Leader 401',
      });

      // Pass duplicate IDs: [house.id, house.id]
      const result = await service.assignHousesToTeam(
        cdcSecretaryScope,
        mockTeamId,
        [house.id, house.id],
      );

      expect(result.success).toBe(true);
      expect(result.assignedCount).toBe(1);
      expect(result.houseIds).toEqual([house.id]);
    });

    it('assignHousesToTeam: rejects if house count exceeds cap of 200', async () => {
      const largeList = Array.from(
        { length: 201 },
        (_, i) => `house-fake-${i}`,
      );
      await expect(
        service.assignHousesToTeam(cdcSecretaryScope, mockTeamId, largeList),
      ).rejects.toThrow();
    });

    it('getHouseholds: preserves territorial scope when search is present (does not overwrite scope OR)', async () => {
      const dcScope: ScopeContext = {
        userId: 'dc-user',
        role: UserRole.dc,
        districtId: mockDistrictId,
      };

      const findManySpy = jest.spyOn(mockPrisma.household, 'findMany');

      await service.getHouseholds(dcScope, {
        search: 'Perera',
        limit: 20,
      });

      expect(findManySpy).toHaveBeenCalled();
      const lastCallArgs = findManySpy.mock.calls[
        findManySpy.mock.calls.length - 1
      ][0] as any;
      const where = lastCallArgs.where;

      // Territorial scope OR must be preserved inside AND alongside search OR
      expect(where.OR).toBeUndefined();
      expect(where.AND).toBeDefined();
      expect(Array.isArray(where.AND)).toBe(true);

      const scopeOr = where.AND.find(
        (item: any) =>
          item.OR &&
          item.OR.some((cond: any) => cond.districtId === mockDistrictId),
      );
      expect(scopeOr).toBeDefined();

      const searchOr = where.AND.find(
        (item: any) =>
          item.OR &&
          item.OR.some((cond: any) => cond.houseLeaderName !== undefined),
      );
      expect(searchOr).toBeDefined();
    });

    it('getHouseholds: uses cursor and skip: 1 for keyset pagination', async () => {
      const findManySpy = jest.spyOn(mockPrisma.household, 'findMany');

      await service.getHouseholds(superAdminScope, {
        cursor: 'house-cursor-123',
        limit: 50,
      });

      expect(findManySpy).toHaveBeenCalled();
      const lastCallArgs = findManySpy.mock.calls[
        findManySpy.mock.calls.length - 1
      ][0] as any;
      expect(lastCallArgs.cursor).toEqual({ id: 'house-cursor-123' });
      expect(lastCallArgs.skip).toBe(1);
    });

    it('getHouseholds: pages correctly across 250 houses with limit 100, preserving rows at positions 101 and 201', async () => {
      const all250Houses = Array.from({ length: 250 }, (_, i) => {
        const pad = String(i + 1).padStart(3, '0');
        return {
          id: `house-${pad}`,
          serialNo: i + 1,
          houseNo: `H-${pad}`,
          houseLeaderName: `Leader ${pad}`,
          villageName: `Village ${pad}`,
          teamId: null,
          gnId: mockGnId,
          version: 1,
          updatedAt: new Date(),
        };
      });

      mockPrisma.household.findMany.mockImplementation((args: any) => {
        let startIndex = 0;
        if (args.cursor) {
          const cursorIndex = all250Houses.findIndex(
            (h) => h.id === args.cursor.id,
          );
          expect(cursorIndex).toBeGreaterThanOrEqual(0);
          startIndex = cursorIndex + (args.skip ?? 0);
        }
        return Promise.resolve(
          all250Houses.slice(startIndex, startIndex + args.take),
        );
      });
      mockPrisma.household.count.mockResolvedValue(250);

      const collectedIds: string[] = [];
      let currentCursor: string | undefined = undefined;
      let pages = 0;

      do {
        pages++;
        const res = await service.getHouseholds(superAdminScope, {
          limit: 100,
          cursor: currentCursor,
        });

        for (const h of res.households) {
          collectedIds.push(h.id);
        }

        currentCursor = res.nextCursor;
      } while (currentCursor);

      expect(pages).toBe(3);
      expect(collectedIds.length).toBe(250);
      expect(new Set(collectedIds).size).toBe(250);

      // Verify that positions 101 and 201 are quietly NOT lost!
      expect(collectedIds[99]).toBe('house-100');
      expect(collectedIds[100]).toBe('house-101');
      expect(collectedIds[199]).toBe('house-200');
      expect(collectedIds[200]).toBe('house-201');
    });

    it('getHouseholds: prevents search probing of masked house leaders by CDC Secretary', async () => {
      const findManySpy = jest.spyOn(mockPrisma.household, 'findMany');

      await service.getHouseholds(cdcSecretaryScope, {
        search: 'Perera',
        limit: 20,
      });

      expect(findManySpy).toHaveBeenCalled();
      const lastCallArgs = findManySpy.mock.calls[
        findManySpy.mock.calls.length - 1
      ][0] as any;
      const where = lastCallArgs.where;

      expect(where.gnId).toBe(mockGnId);
      expect(where.OR).toBeDefined();

      const leaderCondition = where.OR.find(
        (cond: any) =>
          cond.AND &&
          cond.AND.some((c: any) => c.houseLeaderName !== undefined),
      );
      expect(leaderCondition).toBeDefined();
      expect(leaderCondition.AND[0].houseLeaderName).toEqual({
        contains: 'Perera',
        mode: 'insensitive',
      });
      const scopeFilter = leaderCondition.AND[1];
      expect(scopeFilter.OR).toEqual([
        { teamId: mockTeamId },
        { teamId: null },
      ]);
    });

    it('getHouseholds: CDC Secretary without teamId can only match leader name on unassigned houses', async () => {
      const findManySpy = jest.spyOn(mockPrisma.household, 'findMany');
      const secNoTeamScope: ScopeContext = {
        userId: 'sec-no-team-1',
        role: UserRole.cdc_secretary,
        gnId: mockGnId,
        teamId: null,
      };

      await service.getHouseholds(secNoTeamScope, {
        search: 'Silva',
        limit: 20,
      });

      expect(findManySpy).toHaveBeenCalled();
      const lastCallArgs = findManySpy.mock.calls[
        findManySpy.mock.calls.length - 1
      ][0] as any;
      const where = lastCallArgs.where;

      const leaderCondition = where.OR.find(
        (cond: any) =>
          cond.AND &&
          cond.AND.some((c: any) => c.houseLeaderName !== undefined),
      );
      expect(leaderCondition).toBeDefined();
      expect(leaderCondition.AND[0].houseLeaderName).toEqual({
        contains: 'Silva',
        mode: 'insensitive',
      });
      const scopeFilter = leaderCondition.AND[1];
      expect(scopeFilter.OR).toEqual([{ teamId: null }]);
    });

    it('finishHousehold: marks household as completed and dirties team stats', async () => {
      const house = await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '501',
        houseLeaderName: 'Leader 501',
      });

      await service.assignHousesToTeam(cdcSecretaryScope, mockTeamId, [
        house.id,
      ]);

      const teamMemberScope: ScopeContext = {
        userId: 'team-member-1',
        role: UserRole.team_member,
        teamId: mockTeamId,
      };

      const finished = await service.finishHousehold(teamMemberScope, house.id);
      expect(finished.visitStatus).toBe('completed');
      expect(finished.finishedAt).toBeInstanceOf(Date);
      expect(finished.finishedBy).toBe(teamMemberScope.userId);
    });

    it('finishHousehold: rejects when out of scope for team member', async () => {
      const house = await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '502',
        houseLeaderName: 'Leader 502',
      });

      const otherTeamScope: ScopeContext = {
        userId: 'other-user',
        role: UserRole.team_member,
        teamId: 'other-team-id',
      };

      await expect(
        service.finishHousehold(otherTeamScope, house.id),
      ).rejects.toThrow();
    });

    it('finishHousehold: is idempotent and does not re-stamp completed houses', async () => {
      const house = await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '503',
        houseLeaderName: 'Leader 503',
      });
      await service.assignHousesToTeam(cdcSecretaryScope, mockTeamId, [
        house.id,
      ]);

      const teamMemberScope: ScopeContext = {
        userId: 'team-member-1',
        role: UserRole.team_member,
        teamId: mockTeamId,
      };

      const first = await service.finishHousehold(teamMemberScope, house.id);
      expect(first.visitStatus).toBe('completed');
      const firstFinishedAt = first.finishedAt;

      const second = await service.finishHousehold(teamMemberScope, house.id);
      expect(second.finishedAt).toEqual(firstFinishedAt);
      expect(second.version).toBe(first.version);
    });

    it('finishHousehold: rejects secretary with no team or finishing another team house', async () => {
      const house = await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '504',
        houseLeaderName: 'Leader 504',
      });
      await service.assignHousesToTeam(cdcSecretaryScope, mockTeamId, [
        house.id,
      ]);

      const secretaryNoTeam: ScopeContext = {
        userId: 'sec-no-team',
        role: UserRole.cdc_secretary,
        gnId: mockGnId,
      };

      await expect(
        service.finishHousehold(secretaryNoTeam, house.id),
      ).rejects.toThrow();
    });

    it('finishHousehold: rejects team member with null teamId trying to finish unassigned house', async () => {
      const unassignedHouse = await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '505',
        houseLeaderName: 'Leader 505',
      });

      const teamMemberNoTeam: ScopeContext = {
        userId: 'member-no-team',
        role: UserRole.team_member,
        teamId: undefined,
      };

      await expect(
        service.finishHousehold(teamMemberNoTeam, unassignedHouse.id),
      ).rejects.toThrow();
    });

    it('reopenHousehold: allows team leader to reopen completed house', async () => {
      const house = await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '506',
        houseLeaderName: 'Leader 506',
      });
      await service.assignHousesToTeam(cdcSecretaryScope, mockTeamId, [house.id]);

      const teamMemberScope: ScopeContext = {
        userId: 'team-member-1',
        role: UserRole.team_member,
        teamId: mockTeamId,
      };

      const finished = await service.finishHousehold(teamMemberScope, house.id);
      expect(finished.visitStatus).toBe('completed');
      expect(finished.finishedAt).toBeDefined();

      const reopened = await service.reopenHousehold(cdcSecretaryScope, house.id);
      expect(reopened.visitStatus).toBe('not_started');
      expect(reopened.finishedAt).toBeNull();
      expect(reopened.finishedBy).toBeNull();
      expect(reopened.version).toBe(finished.version + 1);
    });

    it('reopenHousehold: rejects Level 5 team member with 403 Forbidden', async () => {
      const house = await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '507',
        houseLeaderName: 'Leader 507',
      });
      await service.assignHousesToTeam(cdcSecretaryScope, mockTeamId, [house.id]);

      const teamMemberScope: ScopeContext = {
        userId: 'team-member-1',
        role: UserRole.team_member,
        teamId: mockTeamId,
      };

      await service.finishHousehold(teamMemberScope, house.id);

      await expect(
        service.reopenHousehold(teamMemberScope, house.id),
      ).rejects.toThrow('Level 5 enumerators cannot reopen finished houses');
    });

    it('reopenHousehold: rejects team leader trying to reopen another team house', async () => {
      const house = await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '508',
        houseLeaderName: 'Leader 508',
      });
      await service.assignHousesToTeam(cdcSecretaryScope, mockTeamId, [house.id]);

      const teamMemberScope: ScopeContext = {
        userId: 'team-member-1',
        role: UserRole.team_member,
        teamId: mockTeamId,
      };
      await service.finishHousehold(teamMemberScope, house.id);

      const otherLeaderScope: ScopeContext = {
        userId: 'other-leader',
        role: UserRole.cdc_secretary,
        gnId: mockGnId,
        teamId: 'other-team-id',
      };

      await expect(
        service.reopenHousehold(otherLeaderScope, house.id),
      ).rejects.toThrow('Household is not assigned to your team');
    });

    it('reopenHousehold: is idempotent when house is already not completed', async () => {
      const house = await service.createHousehold(cdcSecretaryScope, {
        gnId: mockGnId,
        houseNo: '509',
        houseLeaderName: 'Leader 509',
      });
      await service.assignHousesToTeam(cdcSecretaryScope, mockTeamId, [house.id]);

      const initialVersion = house.version;
      const res = await service.reopenHousehold(cdcSecretaryScope, house.id);
      expect(res.visitStatus).toBe('not_started');
      expect(res.version).toBe(initialVersion);
    });
  });
});
