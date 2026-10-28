import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from './sync.service';
import { UserRole, ScopeContext } from '../common/scope/scope.types';
import { ForbiddenException } from '@nestjs/common';

describe('Real PostgreSQL Area Download Scope & Zero Leak Invariants (M2.7)', () => {
  let appModule: TestingModule;
  let prisma: PrismaService;
  let syncService: SyncService;

  let testGnId: string;
  let testDsId: string;
  let testDistrictId: string;
  let testUserId: string;

  let teamA: any;
  let teamB: any;
  let houseA1: any;
  let houseA2: any;
  let houseB1: any;
  let houseB2: any;

  beforeAll(async () => {
    appModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = appModule.get<PrismaService>(PrismaService);
    syncService = appModule.get<SyncService>(SyncService);

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

    // 1. Ensure baseline territory exists
    let gn = await prisma.gnDivision.findFirst({
      include: { ds: { include: { district: true } } },
    });

    if (!gn) {
      const dist = await prisma.district.create({
        data: { nameSi: 'කොළඹ', nameTa: 'கொழும்பு', nameEn: 'Colombo' },
      });
      const ds = await prisma.divisionalSecretariat.create({
        data: {
          districtId: dist.id,
          nameSi: 'කොළඹ',
          nameTa: 'கொழும்பு',
          nameEn: 'Colombo',
        },
      });
      gn = await prisma.gnDivision.create({
        data: {
          dsId: ds.id,
          gnNumber: 'TEST-M27',
          gnName: 'Test GN M27',
        },
        include: { ds: { include: { district: true } } },
      });
    }

    testGnId = gn.id;
    testDsId = gn.ds.id;
    testDistrictId = gn.ds.district.id;

    let testUser = await prisma.profile.findFirst();
    if (!testUser) {
      testUser = await prisma.profile.create({
        data: {
          userCode: `USR-${Math.floor(Math.random() * 80000 + 10000)}`,
          passwordHash: 'dummyhash',
          role: UserRole.admin,
          fullName: 'Test Admin User',
          phoneE164: '+94771234567',
        },
      });
    }
    testUserId = testUser.id;

    // 2. Create dedicated Team A and Team B in real database
    const randA = Math.floor(Math.random() * 80000 + 10000);
    const randB = Math.floor(Math.random() * 80000 + 10000);

    teamA = await prisma.team.create({
      data: { gnId: testGnId, teamNo: randA, maxMembers: 10 },
    });

    teamB = await prisma.team.create({
      data: { gnId: testGnId, teamNo: randB, maxMembers: 10 },
    });

    // 3. Seed real households for Team A and Team B
    const randSerial = Math.floor(Math.random() * 800000 + 100000);
    houseA1 = await prisma.household.create({
      data: {
        districtId: testDistrictId,
        dsId: testDsId,
        gnId: testGnId,
        teamId: teamA.id,
        serialNo: randSerial + 1,
        houseNo: `A1-${randA}`,
        houseNoNorm: `A1-${randA}`,
        houseLeaderName: 'Leader A1',
        createdBy: testUserId,
      },
    });

    houseA2 = await prisma.household.create({
      data: {
        districtId: testDistrictId,
        dsId: testDsId,
        gnId: testGnId,
        teamId: teamA.id,
        serialNo: randSerial + 2,
        houseNo: `A2-${randA}`,
        houseNoNorm: `A2-${randA}`,
        houseLeaderName: 'Leader A2',
        createdBy: testUserId,
      },
    });

    houseB1 = await prisma.household.create({
      data: {
        districtId: testDistrictId,
        dsId: testDsId,
        gnId: testGnId,
        teamId: teamB.id,
        serialNo: randSerial + 3,
        houseNo: `B1-${randB}`,
        houseNoNorm: `B1-${randB}`,
        houseLeaderName: 'Leader B1',
        createdBy: testUserId,
      },
    });

    houseB2 = await prisma.household.create({
      data: {
        districtId: testDistrictId,
        dsId: testDsId,
        gnId: testGnId,
        teamId: teamB.id,
        serialNo: randSerial + 4,
        houseNo: `B2-${randB}`,
        houseNoNorm: `B2-${randB}`,
        houseLeaderName: 'Leader B2',
        createdBy: testUserId,
      },
    });
  }, 45000);

  afterAll(async () => {
    // Clean up all seeded test data
    if (houseA1?.id || houseA2?.id || houseB1?.id || houseB2?.id) {
      await prisma.household.deleteMany({
        where: {
          id: {
            in: [houseA1?.id, houseA2?.id, houseB1?.id, houseB2?.id].filter(
              Boolean,
            ),
          },
        },
      });
    }

    if (teamA?.id || teamB?.id) {
      await prisma.team.deleteMany({
        where: { id: { in: [teamA?.id, teamB?.id].filter(Boolean) } },
      });
    }

    if (appModule) {
      await appModule.close();
    }
  }, 30000);

  it('REAL DB: Team A member ONLY receives Team A houses and ZERO from Team B', async () => {
    const userTeamA: ScopeContext = {
      userId: '00000000-0000-0000-0000-000000000001',
      role: UserRole.team_member,
      teamId: teamA.id,
      gnId: testGnId,
      dsId: testDsId,
      districtId: testDistrictId,
    };

    const res = await syncService.getAreaData(userTeamA);

    expect(res).toBeDefined();
    expect(res.items.length).toBe(2);

    const houseIds = res.items.map((h) => h.id);
    expect(houseIds).toContain(houseA1.id);
    expect(houseIds).toContain(houseA2.id);

    // ZERO CROSS-AREA LEAK: Team B houses MUST NOT appear in Team A's results
    expect(houseIds).not.toContain(houseB1.id);
    expect(houseIds).not.toContain(houseB2.id);

    // All returned houses belong to teamA
    for (const h of res.items) {
      expect(h.teamId).toBe(teamA.id);
    }
  }, 30000);

  it('REAL DB: Team B member ONLY receives Team B houses and ZERO from Team A', async () => {
    const userTeamB: ScopeContext = {
      userId: '00000000-0000-0000-0000-000000000002',
      role: UserRole.team_member,
      teamId: teamB.id,
      gnId: testGnId,
      dsId: testDsId,
      districtId: testDistrictId,
    };

    const res = await syncService.getAreaData(userTeamB);

    expect(res).toBeDefined();
    expect(res.items.length).toBe(2);

    const houseIds = res.items.map((h) => h.id);
    expect(houseIds).toContain(houseB1.id);
    expect(houseIds).toContain(houseB2.id);

    // ZERO CROSS-AREA LEAK: Team A houses MUST NOT appear in Team B's results
    expect(houseIds).not.toContain(houseA1.id);
    expect(houseIds).not.toContain(houseA2.id);

    // All returned houses belong to teamB
    for (const h of res.items) {
      expect(h.teamId).toBe(teamB.id);
    }
  }, 30000);

  it('REAL DB FAIL CLOSED: User with no assigned team/scope throws ForbiddenException (NEVER returns country-wide data)', async () => {
    const userNoTeam: ScopeContext = {
      userId: '00000000-0000-0000-0000-000000000003',
      role: UserRole.team_member,
      // No teamId
    };

    await expect(syncService.getAreaData(userNoTeam)).rejects.toThrow(
      ForbiddenException,
    );
  }, 30000);

  it('REAL DB PAGINATION: Supports cursor pagination across real database records', async () => {
    const userTeamA: ScopeContext = {
      userId: '00000000-0000-0000-0000-000000000001',
      role: UserRole.team_member,
      teamId: teamA.id,
      gnId: testGnId,
      dsId: testDsId,
      districtId: testDistrictId,
    };

    // Page 1 (limit 1)
    const page1 = await syncService.getAreaData(userTeamA, undefined, 1);
    expect(page1.items.length).toBe(1);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBe(houseA1.id);

    // Page 2 (cursor = houseA1.id, limit 1)
    const page2 = await syncService.getAreaData(
      userTeamA,
      page1.nextCursor!,
      1,
    );
    expect(page2.items.length).toBe(1);
    expect(page2.items[0].id).toBe(houseA2.id);
    expect(page2.hasMore).toBe(false);
    expect(page2.nextCursor).toBeNull();
  }, 30000);
});
