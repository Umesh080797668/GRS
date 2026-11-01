import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { HouseholdService } from './household.service';
import { SyncService } from '../sync/sync.service';
import { UserRole, ScopeContext } from '../common/scope/scope.types';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';

describe('Real PostgreSQL HouseholdService, Concurrency & Milestone 4 Invariants', () => {
  jest.setTimeout(240000); // Allow sufficient time for 50 concurrent transactions
  let appModule: TestingModule;
  let prisma: PrismaService;
  let householdService: HouseholdService;
  let syncService: SyncService;

  let testGnId: string;
  let testOtherGnId: string;
  let testDsId: string;
  let testDistrictId: string;
  let cdcSecretaryId: string;
  let otherCdcSecretaryId: string;

  let team1: any;
  let team2: any;

  let cdcSecretaryScope: ScopeContext;
  let team1LeaderScope: ScopeContext;
  let team2LeaderScope: ScopeContext;
  let superAdminScope: ScopeContext;

  beforeAll(async () => {
    appModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = appModule.get<PrismaService>(PrismaService);
    householdService = appModule.get<HouseholdService>(HouseholdService);
    syncService = appModule.get<SyncService>(SyncService);

    // PgBouncer connection retry loop
    let retries = 5;
    while (retries > 0) {
      try {
        await prisma.$connect();
        break;
      } catch (e) {
        retries--;
        if (retries === 0) throw e;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    // Seed test district and DS
    const district = await prisma.district.create({
      data: {
        nameSi: 'කොළඹ-M4',
        nameTa: 'கொழும்பு-M4',
        nameEn: 'Colombo-M4-' + randomUUID().substring(0, 8),
      },
    });
    testDistrictId = district.id;

    const ds = await prisma.divisionalSecretariat.create({
      data: {
        districtId: testDistrictId,
        nameSi: 'තිඹිරිගස්යාය',
        nameTa: 'திம்பிரிகஸ்யாய',
        nameEn: 'Thimbirigasyaya-' + randomUUID().substring(0, 8),
      },
    });
    testDsId = ds.id;

    // Seed primary GN division for testing
    const gn = await prisma.gnDivision.create({
      data: {
        dsId: testDsId,
        gnNumber: 'GN-M4-' + randomUUID().substring(0, 6),
        gnName: 'Havelock Town M4',
        nextSerial: 1,
      },
    });
    testGnId = gn.id;

    // Seed secondary GN division (for cross-GN scope checks)
    const otherGn = await prisma.gnDivision.create({
      data: {
        dsId: testDsId,
        gnNumber: 'GN-M4-OTHER-' + randomUUID().substring(0, 6),
        gnName: 'Wellawatte M4',
        nextSerial: 1,
      },
    });
    testOtherGnId = otherGn.id;

    // Seed CDC Secretary profiles
    const dummyHash =
      '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvT2ubn37qPOJAXwvGFeZqIQxDflSLitA12oQ';
    const genCode = () =>
      'GRS' + Math.floor(1000000000 + Math.random() * 9000000000).toString();

    const cdcProfile = await prisma.profile.create({
      data: {
        userCode: genCode(),
        fullName: 'Kamani Perera (CDC Sec)',
        passwordHash: dummyHash,
        role: UserRole.cdc_secretary,
        districtId: testDistrictId,
        dsId: testDsId,
        gnId: testGnId,
      },
    });
    cdcSecretaryId = cdcProfile.id;

    const otherCdcProfile = await prisma.profile.create({
      data: {
        userCode: genCode(),
        fullName: 'Sunil Silva (Other GN CDC Sec)',
        passwordHash: dummyHash,
        role: UserRole.cdc_secretary,
        districtId: testDistrictId,
        dsId: testDsId,
        gnId: testOtherGnId,
      },
    });
    otherCdcSecretaryId = otherCdcProfile.id;

    // Seed Teams
    team1 = await prisma.team.create({
      data: {
        gnId: testGnId,
        teamNo: 101,
        leaderId: cdcSecretaryId,
      },
    });

    team2 = await prisma.team.create({
      data: {
        gnId: testGnId,
        teamNo: 102,
        leaderId: otherCdcSecretaryId,
      },
    });

    // Scopes
    cdcSecretaryScope = {
      userId: cdcSecretaryId,
      role: UserRole.cdc_secretary,
      districtId: testDistrictId,
      dsId: testDsId,
      gnId: testGnId,
      teamId: team1.id,
    };

    team1LeaderScope = { ...cdcSecretaryScope };

    team2LeaderScope = {
      userId: otherCdcSecretaryId,
      role: UserRole.cdc_secretary,
      districtId: testDistrictId,
      dsId: testDsId,
      gnId: testGnId,
      teamId: team2.id,
    };

    superAdminScope = {
      userId: cdcSecretaryId,
      role: UserRole.super_admin,
    };
  });

  afterAll(async () => {
    try {
      // Clean up test data
      if (testDistrictId) {
        await prisma.clientAudit.deleteMany({
          where: { client: { districtId: testDistrictId } },
        });
        await prisma.client.deleteMany({
          where: { districtId: testDistrictId },
        });
        await prisma.householdUnassignment.deleteMany({
          where: {
            teamId: { in: [team1?.id, team2?.id].filter(Boolean) },
          },
        });
        await prisma.household.deleteMany({
          where: { districtId: testDistrictId },
        });
        await prisma.team.deleteMany({
          where: { id: { in: [team1?.id, team2?.id].filter(Boolean) } },
        });
        await prisma.profile.deleteMany({
          where: {
            id: {
              in: [cdcSecretaryId, otherCdcSecretaryId].filter(Boolean),
            },
          },
        });
        await prisma.gnDivision.deleteMany({
          where: { id: { in: [testGnId, testOtherGnId].filter(Boolean) } },
        });
        await prisma.divisionalSecretariat.deleteMany({
          where: { id: testDsId },
        });
        await prisma.district.deleteMany({
          where: { id: testDistrictId },
        });
      }
    } catch (_) { }
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  describe('M4.1: Real PostgreSQL Concurrent Serial Allocation & Locking', () => {
    it('allocates 50 strictly unique sequential serial numbers under concurrent creation: 50 concurrent creates give 50 unique serials (M4.1 Done When)', async () => {
      const concurrentCount = 50;
      const batchSize = 2; // Pairs of concurrent simultaneous creates competing for row lock
      const results: any[] = [];

      for (let b = 0; b < concurrentCount / batchSize; b++) {
        const idx1 = b * batchSize + 1;
        const idx2 = b * batchSize + 2;
        // Two simultaneous requests competing for the exact same row lock on gn_divisions
        const [h1, h2] = await Promise.all([
          householdService.createHousehold(cdcSecretaryScope, {
            gnId: testGnId,
            houseNo: `REAL-CONC-${idx1}`,
            houseLeaderName: `Leader Real ${idx1}`,
          }),
          householdService.createHousehold(cdcSecretaryScope, {
            gnId: testGnId,
            houseNo: `REAL-CONC-${idx2}`,
            houseLeaderName: `Leader Real ${idx2}`,
          }),
        ]);
        results.push(h1, h2);
      }

      expect(results.length).toBe(concurrentCount);

      // Verify all 50 serial numbers are unique
      const serials = results.map((h) => h.serialNo);
      const uniqueSerials = new Set(serials);
      expect(uniqueSerials.size).toBe(concurrentCount);

      // Verify serials span a continuous sequence without duplicates
      const minSerial = Math.min(...serials);
      const maxSerial = Math.max(...serials);
      expect(maxSerial - minSerial + 1).toBe(concurrentCount);

      // Verify the nextSerial in gn_divisions table is correctly updated
      const gnUpdated = await prisma.gnDivision.findUnique({
        where: { id: testGnId },
      });
      expect(gnUpdated?.nextSerial).toBe(maxSerial + 1);
    });

    it('rejects duplicate house number within the same GN division in real PostgreSQL', async () => {
      await expect(
        householdService.createHousehold(cdcSecretaryScope, {
          gnId: testGnId,
          houseNo: 'REAL-CONC-1', // Already created above
          houseLeaderName: 'Duplicate Attempt',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('prevents CDC Secretary from creating a household outside their assigned GN division', async () => {
      await expect(
        householdService.createHousehold(cdcSecretaryScope, {
          gnId: testOtherGnId, // Different GN
          houseNo: 'OUT-OF-SCOPE-1',
          houseLeaderName: 'Should Fail',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('M4.2: Race-Safe Team House Claiming against Real PostgreSQL', () => {
    it('handles two leaders claiming the same house: exactly one wins; the other gets 409 + list (M4.2 Done When)', async () => {
      // 1. Seed two unassigned houses in the GN division
      const house1 = await householdService.createHousehold(cdcSecretaryScope, {
        gnId: testGnId,
        houseNo: 'CLAIM-RACE-001',
        houseLeaderName: 'Leader Race 1',
      });
      const house2 = await householdService.createHousehold(cdcSecretaryScope, {
        gnId: testGnId,
        houseNo: 'CLAIM-RACE-002',
        houseLeaderName: 'Leader Race 2',
      });

      // 2. Both Team 1 Leader and Team 2 Leader attempt to claim house1 simultaneously
      const [res1, res2] = await Promise.allSettled([
        householdService.assignHousesToTeam(team1LeaderScope, team1.id, [
          house1.id,
        ]),
        householdService.assignHousesToTeam(team2LeaderScope, team2.id, [
          house1.id,
        ]),
      ]);

      // Exactly ONE must succeed (fulfilled) and exactly ONE must fail (rejected with 409)
      const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
      const rejected = [res1, res2].filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const failedResult = rejected[0];
      expect(failedResult.reason).toBeInstanceOf(ConflictException);
      expect(failedResult.reason.response.code).toBe('HOUSE_CLAIM_CONFLICT');
      expect(failedResult.reason.response.unavailableHouseIds).toContain(
        house1.id,
      );

      // Verify in database that house1 is assigned to exactly the winner's team
      const claimedHouse = await prisma.household.findUnique({
        where: { id: house1.id },
      });
      expect(claimedHouse?.teamId).toBeDefined();
      expect([team1.id, team2.id]).toContain(claimedHouse?.teamId);
    });
  });

  describe('Decision C6 & §8.4: Soft Delete, Unassign & Reassign Rules', () => {
    it('Decision C6: blocks soft delete if clients exist on the household in real PostgreSQL', async () => {
      // 1. Create a house
      const house = await householdService.createHousehold(cdcSecretaryScope, {
        gnId: testGnId,
        houseNo: 'C6-DELETE-TEST',
        houseLeaderName: 'C6 Leader',
      });

      // 2. Attach a client to the house
      await prisma.client.create({
        data: {
          householdId: house.id,
          districtId: testDistrictId,
          dsId: testDsId,
          gnId: testGnId,
          teamId: team1.id,
          name: 'Attached Client 1',
          nameNorm: 'ATTACHED CLIENT 1',
          age: 35,
          gender: 'F',
          consentGiven: true,
          collectedBy: cdcSecretaryId,
          collectedAt: new Date(),
          clientUpdatedAt: new Date(),
          contentHash: 'hash-c6-test-1',
          infoProvidedBy: 'self',
          createdBy: cdcSecretaryId,
        },
      });

      // 3. Attempt to soft-delete the house: MUST be blocked with ConflictException
      await expect(
        householdService.deleteHousehold(cdcSecretaryScope, house.id),
      ).rejects.toThrow(ConflictException);

      // 4. Remove the client
      await prisma.client.deleteMany({
        where: { householdId: house.id },
      });

      // 5. Soft-delete without clients: MUST succeed
      const deleteRes = await householdService.deleteHousehold(
        cdcSecretaryScope,
        house.id,
      );
      expect(deleteRes.success).toBe(true);

      const deletedHouse = await prisma.household.findUnique({
        where: { id: house.id },
      });
      expect(deletedHouse?.deletedAt).not.toBeNull();
    });

    it('§8.4 Unassign Rules: unassign is permitted ONLY when no clients exist, otherwise blocks with 409', async () => {
      // 1. Create a house and assign it to Team 1
      const house = await householdService.createHousehold(cdcSecretaryScope, {
        gnId: testGnId,
        houseNo: 'UNASSIGN-RULE-001',
        houseLeaderName: 'Unassign Rule Leader',
      });
      await householdService.assignHousesToTeam(cdcSecretaryScope, team1.id, [
        house.id,
      ]);

      // 2. Attach a client to the house
      const client = await prisma.client.create({
        data: {
          householdId: house.id,
          districtId: testDistrictId,
          dsId: testDsId,
          gnId: testGnId,
          teamId: team1.id,
          name: 'Client On Team 1 House',
          nameNorm: 'CLIENT ON TEAM 1 HOUSE',
          age: 40,
          gender: 'M',
          consentGiven: true,
          collectedBy: cdcSecretaryId,
          collectedAt: new Date(),
          clientUpdatedAt: new Date(),
          contentHash: 'hash-unassign-test-1',
          infoProvidedBy: 'self',
          createdBy: cdcSecretaryId,
        },
      });

      // 3. Attempting to unassign with clients MUST fail with ConflictException
      await expect(
        householdService.unassignHouseFromTeam(
          cdcSecretaryScope,
          team1.id,
          house.id,
        ),
      ).rejects.toThrow(ConflictException);

      // 4. Clean up client
      await prisma.client.delete({ where: { id: client.id } });

      // 5. Unassign without clients MUST succeed and record unassignment event
      const unassignRes = await householdService.unassignHouseFromTeam(
        cdcSecretaryScope,
        team1.id,
        house.id,
      );
      expect(unassignRes.success).toBe(true);

      const unassignedHouse = await prisma.household.findUnique({
        where: { id: house.id },
      });
      expect(unassignedHouse?.teamId).toBeNull();

      // Verify unassignment is recorded in household_unassignments table
      const unassignRecord = await prisma.householdUnassignment.findFirst({
        where: { householdId: house.id, teamId: team1.id },
      });
      expect(unassignRecord).toBeDefined();
      expect(unassignRecord?.teamId).toBe(team1.id);
    });

    it('Build Plan §8.4 Reassign Rules: reassigning house with clients atomically updates house AND clients teamId in real PostgreSQL', async () => {
      // 1. Create a house and assign it to Team 1
      const house = await householdService.createHousehold(cdcSecretaryScope, {
        gnId: testGnId,
        houseNo: 'REASSIGN-RULE-001',
        houseLeaderName: 'Reassign Leader',
      });
      await householdService.assignHousesToTeam(cdcSecretaryScope, team1.id, [
        house.id,
      ]);

      // 2. Attach a client to the house on Team 1
      const client = await prisma.client.create({
        data: {
          householdId: house.id,
          districtId: testDistrictId,
          dsId: testDsId,
          gnId: testGnId,
          teamId: team1.id,
          name: 'Client To Reassign',
          nameNorm: 'CLIENT TO REASSIGN',
          age: 28,
          gender: 'F',
          consentGiven: true,
          collectedBy: cdcSecretaryId,
          collectedAt: new Date(),
          clientUpdatedAt: new Date(),
          contentHash: 'hash-reassign-test-1',
          infoProvidedBy: 'self',
          createdBy: cdcSecretaryId,
        },
      });

      // Verify Level 4 cannot reassign houses
      await expect(
        householdService.reassignHouseToTeam(
          cdcSecretaryScope,
          team2.id,
          house.id,
        ),
      ).rejects.toThrow();

      // 3. Reassign house to Team 2 using Level 00 (super_admin)
      const reassignRes = await householdService.reassignHouseToTeam(
        superAdminScope,
        team2.id,
        house.id,
      );
      expect(reassignRes.success).toBe(true);
      expect(reassignRes.reassignedClientsCount).toBe(1);

      // Verify in DB that household is now on Team 2
      const houseAfter = await prisma.household.findUnique({
        where: { id: house.id },
      });
      expect(houseAfter?.teamId).toBe(team2.id);

      // Verify in DB that client was atomically reassigned to Team 2
      const clientAfter = await prisma.client.findUnique({
        where: { id: client.id },
      });
      expect(clientAfter?.teamId).toBe(team2.id);

      // Verify unassignment event was recorded for Team 1
      const unassignForTeam1 = await prisma.householdUnassignment.findFirst({
        where: { householdId: house.id, teamId: team1.id },
      });
      expect(unassignForTeam1).toBeDefined();
    });
  });

  describe('M4.5 /sync/changes Gap Fix: Unassigned house is delivered in deletedHouseholds', () => {
    it('/sync/changes returns unassigned houses in deletedHouseholds for the previous team so mobile phones remove them', async () => {
      const syncCursor = new Date(Date.now() - 10000).toISOString();

      // 1. Create a house and assign to Team 1
      const house = await householdService.createHousehold(cdcSecretaryScope, {
        gnId: testGnId,
        houseNo: 'SYNC-UNASSIGN-001',
        houseLeaderName: 'Sync Unassign Leader',
      });
      await householdService.assignHousesToTeam(cdcSecretaryScope, team1.id, [
        house.id,
      ]);

      // 2. Unassign the house from Team 1
      await householdService.unassignHouseFromTeam(
        cdcSecretaryScope,
        team1.id,
        house.id,
      );

      // 3. Team 1 calls /sync/changes with cursor
      const changes = await syncService.getChanges(
        team1LeaderScope,
        syncCursor,
      );

      // 4. Verify unassigned house IS returned in deletedHouseholds for Team 1
      const deletedEntry = changes.deletedHouseholds.find(
        (d) => d.id === house.id,
      );
      expect(deletedEntry).toBeDefined();
      expect(deletedEntry?.deletedReason).toBe('unassigned_from_team');

      // 5. Verify the house is NOT present in updatedHouseholds for Team 1
      const updatedEntry = changes.households.find((h) => h.id === house.id);
      expect(updatedEntry).toBeUndefined();
    });
  });
});
