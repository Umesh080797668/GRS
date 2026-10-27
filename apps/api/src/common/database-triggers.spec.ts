import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, Gender, InfoProvidedBy } from '@prisma/client';

describe('Real PostgreSQL Triggers & Client Auditing (M1.13)', () => {
  let appModule: TestingModule;
  let prisma: PrismaService;
  let testUserId: string;
  let testGnId: string;
  let testDsId: string;
  let testDistrictId: string;
  let testHouseholdId: string;
  let testClientId: string;

  beforeAll(async () => {
    appModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = appModule.get<PrismaService>(PrismaService);

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

    // Fetch or create baseline area hierarchy
    let gn = await prisma.gnDivision.findFirst({
      include: { ds: { include: { district: true } } },
    });
    if (!gn) {
      const dist = await prisma.district.create({
        data: { nameSi: 'කොළඹ', nameTa: 'கொழும்பு', nameEn: 'Colombo' },
      });
      const ds = await prisma.divisionalSecretariat.create({
        data: { districtId: dist.id, nameSi: 'කොළඹ', nameTa: 'கொழும்பு', nameEn: 'Colombo' },
      });
      gn = await prisma.gnDivision.create({
        data: { dsId: ds.id, gnNumber: 'TRIG-101', gnName: 'Trigger GN' },
        include: { ds: { include: { district: true } } },
      });
    }

    testGnId = gn.id;
    testDsId = gn.ds.id;
    testDistrictId = gn.ds.district.id;

    // Fetch or create test user
    let user = await prisma.profile.findFirst({ where: { isActive: true } });
    if (!user) {
      user = await prisma.profile.create({
        data: {
          userCode: 'GRS9999990003',
          passwordHash: '$argon2id$v=19$m=32768,t=2,p=2$dGVzdA$test',
          role: UserRole.team_member,
          fullName: 'Trigger Test User',
          districtId: testDistrictId,
          dsId: testDsId,
          gnId: testGnId,
          isActive: true,
        },
      });
    }
    testUserId = user.id;

    // Create a test household
    const randomSerial = Math.floor(Math.random() * 800000) + 100000;
    const household = await prisma.household.create({
      data: {
        gnId: testGnId,
        dsId: testDsId,
        districtId: testDistrictId,
        serialNo: randomSerial,
        houseNo: `T-${randomSerial}`,
        houseNoNorm: `T-${randomSerial}`,
        houseLeaderName: 'Test Household Leader',
        createdBy: testUserId,
      },
    });
    testHouseholdId = household.id;

    // Create a test client
    const client = await prisma.client.create({
      data: {
        householdId: testHouseholdId,
        districtId: testDistrictId,
        dsId: testDsId,
        gnId: testGnId,
        name: 'Initial Client Name',
        nameNorm: 'INITIAL CLIENT NAME',
        age: 28,
        gender: Gender.F,
        infoProvidedBy: InfoProvidedBy.self,
        consentGiven: true,
        collectedBy: testUserId,
        createdBy: testUserId,
        collectedAt: new Date(),
        clientUpdatedAt: new Date(),
        contentHash: 'a'.repeat(64),
      },
    });
    testClientId = client.id;
  }, 30000);

  afterAll(async () => {
    // Cleanup created test records
    try {
      if (testClientId) {
        await prisma.clientAudit.deleteMany({ where: { clientId: testClientId } });
        await prisma.client.delete({ where: { id: testClientId } });
      }
      if (testHouseholdId) {
        await prisma.household.delete({ where: { id: testHouseholdId } });
      }
    } catch {
      // Ignore cleanup error
    }
    await appModule.close();
  }, 15000);

  it('triggers fn_bump_household_version on UPDATE and increments version 1 -> 2', async () => {
    const before = await prisma.household.findUnique({
      where: { id: testHouseholdId },
    });
    expect(before?.version).toBe(1);

    const updated = await prisma.household.update({
      where: { id: testHouseholdId },
      data: { houseLeaderName: 'Updated Household Leader' },
    });

    expect(updated.version).toBe(2);
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(before!.updatedAt.getTime());
  }, 15000);

  it('triggers fn_bump_client_version on UPDATE and increments server_version 1 -> 2', async () => {
    const before = await prisma.client.findUnique({
      where: { id: testClientId },
    });
    expect(before?.serverVersion).toBe(1);

    const updated = await prisma.client.update({
      where: { id: testClientId },
      data: { name: 'Updated Client Name' },
    });

    expect(updated.serverVersion).toBe(2);
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(before!.updatedAt.getTime());
  }, 15000);

  it('triggers fn_client_audit and records audit log row on client UPDATE', async () => {
    const auditLogs = await prisma.clientAudit.findMany({
      where: { clientId: testClientId },
      orderBy: { changedAt: 'desc' },
    });

    expect(auditLogs.length).toBeGreaterThan(0);
    const latest = auditLogs[0];
    expect(latest.clientId).toBe(testClientId);
    expect(latest.before).toBeDefined();
    expect(latest.after).toBeDefined();
  }, 15000);

  it('triggers fn_check_client_immutable and rejects mutating collected_by with error 42501', async () => {
    const otherUserId = '00000000-0000-0000-0000-000000000099';

    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE clients SET collected_by = '${otherUserId}'::uuid WHERE id = '${testClientId}'::uuid;`,
      ),
    ).rejects.toThrow(/immutable/i);
  }, 15000);

  it('triggers fn_check_household_immutable and rejects mutating serial_no with error 42501', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE households SET serial_no = 999999 WHERE id = '${testHouseholdId}'::uuid;`,
      ),
    ).rejects.toThrow(/immutable/i);
  }, 15000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (appModule) {
      await appModule.close();
    }
  });
});
