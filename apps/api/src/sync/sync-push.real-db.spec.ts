import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from './sync.service';
import { UserRole, ScopeContext } from '../common/scope/scope.types';
import { SyncPushDto } from './dto/sync-push.dto';
import { randomUUID } from 'crypto';

describe('Real PostgreSQL Push Sync & Atomic Invariants (M3.1)', () => {
  let appModule: TestingModule;
  let prisma: PrismaService;
  let syncService: SyncService;

  let testGnId: string;
  let testDsId: string;
  let testDistrictId: string;
  let testUserId: string;

  let teamA: any;
  let teamB: any;
  let houseA: any;
  let houseB: any;
  let houseDeleted: any;

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

    // Baseline territory
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
          gnNumber: 'TEST-M31',
          gnName: 'Test GN M31',
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

    const randA = Math.floor(Math.random() * 80000 + 10000);
    const randB = Math.floor(Math.random() * 80000 + 10000);

    teamA = await prisma.team.create({
      data: { gnId: testGnId, teamNo: randA, maxMembers: 10 },
    });

    teamB = await prisma.team.create({
      data: { gnId: testGnId, teamNo: randB, maxMembers: 10 },
    });

    const randSerial = Math.floor(Math.random() * 800000 + 100000);
    houseA = await prisma.household.create({
      data: {
        districtId: testDistrictId,
        dsId: testDsId,
        gnId: testGnId,
        teamId: teamA.id,
        serialNo: randSerial + 1,
        houseNo: `A-${randA}`,
        houseNoNorm: `A-${randA}`,
        houseLeaderName: 'Leader A',
        createdBy: testUserId,
      },
    });

    houseB = await prisma.household.create({
      data: {
        districtId: testDistrictId,
        dsId: testDsId,
        gnId: testGnId,
        teamId: teamB.id,
        serialNo: randSerial + 2,
        houseNo: `B-${randB}`,
        houseNoNorm: `B-${randB}`,
        houseLeaderName: 'Leader B',
        createdBy: testUserId,
      },
    });

    houseDeleted = await prisma.household.create({
      data: {
        districtId: testDistrictId,
        dsId: testDsId,
        gnId: testGnId,
        teamId: teamA.id,
        serialNo: randSerial + 3,
        houseNo: `DEL-${randA}`,
        houseNoNorm: `DEL-${randA}`,
        houseLeaderName: 'Leader Deleted',
        createdBy: testUserId,
        deletedAt: new Date(),
      },
    });
  }, 45000);

  afterAll(async () => {
    try {
      if (houseA) await prisma.client.deleteMany({ where: { householdId: houseA.id } });
      if (houseB) await prisma.client.deleteMany({ where: { householdId: houseB.id } });
      if (houseA) await prisma.household.delete({ where: { id: houseA.id } });
      if (houseB) await prisma.household.delete({ where: { id: houseB.id } });
      if (houseDeleted) await prisma.household.delete({ where: { id: houseDeleted.id } });
      if (teamA) await prisma.team.delete({ where: { id: teamA.id } });
      if (teamB) await prisma.team.delete({ where: { id: teamB.id } });
    } catch (_) { }
    await prisma.$disconnect();
  });

  it('REAL DB PUSH: Agent pushes client record; CTE writes client and dirties team stats atomically', async () => {
    const caller: ScopeContext = {
      userId: testUserId,
      role: UserRole.team_member,
      teamId: teamA.id,
      gnId: testGnId,
      dsId: testDsId,
      districtId: testDistrictId,
    };

    const clientId = randomUUID();
    const dto: SyncPushDto = {
      device_id: 'real-device-1',
      app_version: '2.0.0',
      schema_version: 2,
      records: [
        {
          id: clientId,
          base_version: 0,
          data: {
            household_id: houseA.id,
            name: 'Sunil Perera',
            age: 35,
            gender: 'M',
            consent_given: true,
            phone_raw: '0771234567',
          },
        },
      ],
    };

    const res = await syncService.pushRecords(caller, dto);
    expect(res.results.length).toBe(1);
    expect(res.results[0].status).toBe('ok');
    expect(res.results[0].server_version).toBe(1);

    // Verify row in real Postgres
    const clientRow = await prisma.client.findUnique({ where: { id: clientId } });
    expect(clientRow).toBeDefined();
    expect(clientRow!.name).toBe('Sunil Perera');
    expect(clientRow!.serverVersion).toBe(1);

    // Verify team stats_dirty_at was updated by CTE in the same statement
    const teamRow = await prisma.team.findUnique({ where: { id: teamA.id } });
    expect(teamRow!.statsDirtyAt).toBeDefined();
    expect(teamRow!.statsDirtyAt).not.toBeNull();
  }, 30000);

  it('REAL DB BATCH RESILIENCE: Duplicate client IDs in the same batch do NOT throw Postgres 500 error 21000', async () => {
    const caller: ScopeContext = {
      userId: testUserId,
      role: UserRole.team_member,
      teamId: teamA.id,
      gnId: testGnId,
      dsId: testDsId,
      districtId: testDistrictId,
    };

    const dupClientId = randomUUID();
    const dto: SyncPushDto = {
      device_id: 'real-device-dup',
      app_version: '2.0.0',
      schema_version: 2,
      records: [
        {
          id: dupClientId,
          base_version: 0,
          data: {
            household_id: houseA.id,
            name: 'First Occurrence',
            age: 25,
            gender: 'F',
            consent_given: true,
          },
        },
        {
          id: dupClientId,
          base_version: 0,
          data: {
            household_id: houseA.id,
            name: 'Second Occurrence Duplicate',
            age: 26,
            gender: 'F',
            consent_given: true,
          },
        },
      ],
    };

    // Must not throw an unhandled exception or 500
    const res = await syncService.pushRecords(caller, dto);
    expect(res.results.length).toBe(2);
    expect(res.results[0].status).toBe('ok');
    expect(res.results[1].status).toBe('rejected');
    expect(res.results[1].code).toBe('DUPLICATE_IN_BATCH');
  }, 30000);

  it('REAL DB LEVEL 4 SCOPE: CDC Secretary cannot write into another team households (§8.3)', async () => {
    const secretaryCaller: ScopeContext = {
      userId: randomUUID(),
      role: UserRole.cdc_secretary,
      teamId: teamA.id,
      gnId: testGnId, // Same GN division
      dsId: testDsId,
      districtId: testDistrictId,
    };

    const clientId = randomUUID();
    const dto: SyncPushDto = {
      device_id: 'sec-device-scope',
      app_version: '2.0.0',
      schema_version: 2,
      records: [
        {
          id: clientId,
          base_version: 0,
          data: {
            household_id: houseB.id, // Belongs to Team B!
            name: 'Cross Team Entry',
            age: 40,
            gender: 'M',
            consent_given: true,
          },
        },
      ],
    };

    const res = await syncService.pushRecords(secretaryCaller, dto);
    expect(res.results.length).toBe(1);
    expect(res.results[0].status).toBe('forbidden');
    expect(res.results[0].code).toBe('HOUSEHOLD_OUT_OF_SCOPE');

    // Confirm no client row created
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    expect(client).toBeNull();
  }, 30000);

  it('REAL DB SOFT-DELETED HOUSEHOLD: Records for soft-deleted households are rejected with HOUSEHOLD_DELETED (§8.3)', async () => {
    const caller: ScopeContext = {
      userId: testUserId,
      role: UserRole.team_member,
      teamId: teamA.id,
      gnId: testGnId,
      dsId: testDsId,
      districtId: testDistrictId,
    };

    const clientId = randomUUID();
    const dto: SyncPushDto = {
      device_id: 'real-device-del',
      app_version: '2.0.0',
      schema_version: 2,
      records: [
        {
          id: clientId,
          base_version: 0,
          data: {
            household_id: houseDeleted.id,
            name: 'Deleted House Member',
            age: 22,
            gender: 'M',
            consent_given: true,
          },
        },
      ],
    };

    const res = await syncService.pushRecords(caller, dto);
    expect(res.results.length).toBe(1);
    expect(res.results[0].status).toBe('forbidden');
    expect(res.results[0].code).toBe('HOUSEHOLD_DELETED');
  }, 30000);

  it('REAL DB DECISION C2: Level 5 cannot edit synced records (returns locked)', async () => {
    const caller: ScopeContext = {
      userId: testUserId,
      role: UserRole.team_member,
      teamId: teamA.id,
      gnId: testGnId,
      dsId: testDsId,
      districtId: testDistrictId,
    };

    const clientId = randomUUID();
    // 1. Initial push -> ok
    const push1: SyncPushDto = {
      device_id: 'real-device-c2',
      app_version: '2.0.0',
      schema_version: 2,
      records: [
        {
          id: clientId,
          base_version: 0,
          data: {
            household_id: houseA.id,
            name: 'Original Record Name',
            age: 30,
            gender: 'F',
            consent_given: true,
          },
        },
      ],
    };
    const res1 = await syncService.pushRecords(caller, push1);
    expect(res1.results[0].status).toBe('ok');

    // 2. Agent attempts to edit the record after sync
    const push2: SyncPushDto = {
      device_id: 'real-device-c2',
      app_version: '2.0.0',
      schema_version: 2,
      records: [
        {
          id: clientId,
          base_version: 1,
          data: {
            household_id: houseA.id,
            name: 'Attempted Name Change',
            age: 31,
            gender: 'F',
            consent_given: true,
          },
        },
      ],
    };
    const res2 = await syncService.pushRecords(caller, push2);
    expect(res2.results[0].status).toBe('locked');

    // Confirm database value did not change
    const row = await prisma.client.findUnique({ where: { id: clientId } });
    expect(row!.name).toBe('Original Record Name');
  }, 30000);

  it('REAL DB DIVISIONAL SCOPING: SDA (Level 3) can push within their DS division (Blueprint §10.3)', async () => {
    const sdaCaller: ScopeContext = {
      userId: testUserId,
      role: UserRole.sda,
      dsId: testDsId,
      districtId: testDistrictId,
    };

    const clientId = randomUUID();
    const dto: SyncPushDto = {
      device_id: 'sda-device-real',
      app_version: '2.0.0',
      schema_version: 2,
      records: [
        {
          id: clientId,
          base_version: 0,
          data: {
            household_id: houseA.id, // In testDsId
            name: 'SDA Surveyed Client',
            age: 45,
            gender: 'M',
            consent_given: true,
          },
        },
      ],
    };

    const res = await syncService.pushRecords(sdaCaller, dto);
    expect(res.results.length).toBe(1);
    expect(res.results[0].status).toBe('ok');
    expect(res.results[0].server_version).toBe(1);
  }, 30000);
});
