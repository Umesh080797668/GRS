import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from '../sync/sync.service';
import { DuplicatesService } from './duplicates.service';
import { StatsRefreshService } from '../jobs/stats-refresh.service';
import { UserRole, ScopeContext } from '../common/scope/scope.types';
import { SyncPushDto } from '../sync/dto/sync-push.dto';
import {
  DuplicateClassificationFilter,
  DuplicateFilterStatus,
} from './dto/duplicate.dto';
import { randomUUID } from 'crypto';

describe('Real PostgreSQL Duplicate Detection & Soft-Link Stats Exclusion (M6)', () => {
  let appModule: TestingModule;
  let prisma: PrismaService;
  let syncService: SyncService;
  let duplicatesService: DuplicatesService;
  let statsRefreshService: StatsRefreshService;

  let testDistrictId: string;
  let testDsId: string;
  let testGnId: string;
  let testTeamId = '';
  let testHouseId = '';
  let l4UserId = '';
  let l5UserId = '';
  const createdClientIds: string[] = [];

  beforeAll(async () => {
    appModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = appModule.get<PrismaService>(PrismaService);
    syncService = appModule.get<SyncService>(SyncService);
    duplicatesService = appModule.get<DuplicatesService>(DuplicatesService);
    statsRefreshService =
      appModule.get<StatsRefreshService>(StatsRefreshService);

    await prisma.$connect();

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
          gnNumber: `M6-${Math.floor(Math.random() * 9000 + 1000)}`,
          gnName: 'Test GN M6',
        },
        include: { ds: { include: { district: true } } },
      });
    }

    testGnId = gn.id;
    testDsId = gn.ds.id;
    testDistrictId = gn.ds.district.id;

    const rand5 = Math.floor(Math.random() * 80000 + 10000);
    const createdTeam = await prisma.team.create({
      data: { gnId: testGnId, teamNo: rand5, maxMembers: 10 },
    });
    testTeamId = createdTeam.id;

    const createdL4 = await prisma.profile.create({
      data: {
        userCode: `GRS40000${rand5}`,
        passwordHash: 'dummyhash',
        role: UserRole.cdc_secretary,
        fullName: 'L4 Reviewer M6',
        phoneE164: `+9477${rand5}11`.slice(0, 12),
        districtId: testDistrictId,
        dsId: testDsId,
        gnId: testGnId,
        teamId: testTeamId,
      },
    });
    l4UserId = createdL4.id;

    const createdL5 = await prisma.profile.create({
      data: {
        userCode: `GRS50000${rand5}`,
        passwordHash: 'dummyhash',
        role: UserRole.team_member,
        fullName: 'L5 Enumerator M6',
        phoneE164: `+9477${rand5}22`.slice(0, 12),
        districtId: testDistrictId,
        dsId: testDsId,
        gnId: testGnId,
        teamId: testTeamId,
      },
    });
    l5UserId = createdL5.id;

    const createdHouse = await prisma.household.create({
      data: {
        districtId: testDistrictId,
        dsId: testDsId,
        gnId: testGnId,
        teamId: testTeamId,
        serialNo: rand5 + 500,
        houseNo: `M6-${rand5}`,
        houseNoNorm: `M6-${rand5}`,
        houseLeaderName: 'Nimali Perera',
        createdBy: l4UserId,
      },
    });
    testHouseId = createdHouse.id;
  }, 45000);

  afterAll(async () => {
    try {
      if (createdClientIds.length > 0) {
        await prisma.duplicateCandidate.deleteMany({
          where: {
            OR: [
              { clientA: { in: createdClientIds } },
              { clientB: { in: createdClientIds } },
            ],
          },
        });
        await prisma.clientAudit.deleteMany({
          where: { clientId: { in: createdClientIds } },
        });
        await prisma.client.updateMany({
          where: { id: { in: createdClientIds } },
          data: { duplicateOf: null },
        });
        await prisma.client.deleteMany({
          where: { id: { in: createdClientIds } },
        });
      }
      if (testHouseId) {
        await prisma.household.delete({ where: { id: testHouseId } });
      }
      if (testTeamId) {
        await prisma.teamStat.deleteMany({ where: { teamId: testTeamId } });
        await prisma.team.delete({ where: { id: testTeamId } });
      }
      if (l5UserId) await prisma.profile.delete({ where: { id: l5UserId } });
      if (l4UserId) await prisma.profile.delete({ where: { id: l4UserId } });
    } catch {
      /* ignore teardown failure */
    }
    await prisma.$disconnect();
    await appModule?.close();
  }, 45000);

  it('REAL DB M6: SyncService triggers post-commit duplicate candidate, L4 confirms soft-link, and StatsRefresh excludes confirmed duplicate with zero drift', async () => {
    const l5Caller: ScopeContext = {
      userId: l5UserId,
      role: UserRole.team_member,
      teamId: testTeamId,
      gnId: testGnId,
      dsId: testDsId,
      districtId: testDistrictId,
    };
    const l4Caller: ScopeContext = {
      userId: l4UserId,
      role: UserRole.cdc_secretary,
      teamId: testTeamId,
      gnId: testGnId,
      dsId: testDsId,
      districtId: testDistrictId,
    };

    const canonicalId = randomUUID();
    const duplicateId = randomUUID();
    const siblingId = randomUUID();
    createdClientIds.push(canonicalId, duplicateId, siblingId);

    const uniquePhone = `077${Math.floor(1000000 + Math.random() * 8999999)}`;
    const siblingPhone = `071${Math.floor(1000000 + Math.random() * 8999999)}`;

    // 1. Push canonical person + distinct sibling in same household
    const push1: SyncPushDto = {
      device_id: 'm6-dev-1',
      app_version: '2.0.0',
      schema_version: 2,
      records: [
        {
          id: canonicalId,
          base_version: 0,
          data: {
            household_id: testHouseId,
            name: 'Mrs. Nimali K. Perera',
            age: 34,
            gender: 'F',
            consent_given: true,
            consent_version: 'consent.v0',
            info_provided_by: 'self',
            phone_raw: uniquePhone,
          },
        },
        {
          id: siblingId,
          base_version: 0,
          data: {
            household_id: testHouseId,
            name: 'Kasun B. Perera',
            age: 29,
            gender: 'M',
            consent_given: true,
            consent_version: 'consent.v0',
            info_provided_by: 'self',
            phone_raw: siblingPhone,
          },
        },
      ],
    };

    const res1 = await syncService.pushRecords(l5Caller, push1);
    expect(res1.results.every((r) => r.status === 'ok')).toBe(true);

    // Sibling has different first name, different gender, different phone -> not flagged
    const afterPush1 = await duplicatesService.listDuplicates(l4Caller, {
      status: DuplicateFilterStatus.open,
      teamId: testTeamId,
    });
    expect(
      afterPush1.items.some(
        (i) =>
          (i.clientA === canonicalId && i.clientB === siblingId) ||
          (i.clientB === canonicalId && i.clientA === siblingId),
      ),
    ).toBe(false);

    // 2. Push probable duplicate (same phone + matching normalized name + same GN/house)
    const push2: SyncPushDto = {
      device_id: 'm6-dev-2',
      app_version: '2.0.0',
      schema_version: 2,
      records: [
        {
          id: duplicateId,
          base_version: 0,
          data: {
            household_id: testHouseId,
            name: 'Nimali Perera',
            age: 34,
            gender: 'F',
            consent_given: true,
            consent_version: 'consent.v0',
            info_provided_by: 'self',
            phone_raw: uniquePhone,
          },
        },
      ],
    };

    const res2 = await syncService.pushRecords(l5Caller, push2);
    expect(res2.results[0].status).toBe('ok');

    // Verify duplicate candidate persisted as probable & open
    const queue = await duplicatesService.listDuplicates(l4Caller, {
      status: DuplicateFilterStatus.open,
      classification: DuplicateClassificationFilter.probable,
      teamId: testTeamId,
    });
    const matchedPair = queue.items.find(
      (i) =>
        (i.clientA === canonicalId && i.clientB === duplicateId) ||
        (i.clientB === canonicalId && i.clientA === duplicateId),
    );
    expect(matchedPair).toBeDefined();
    if (!matchedPair) {
      throw new Error('Expected probable duplicate candidate');
    }
    expect(matchedPair.classification).toBe('probable');
    expect(matchedPair.score).toBeGreaterThanOrEqual(85);

    // Clear dirty timestamp first so we assert confirmDuplicate dirties the team stats
    await prisma.team.update({
      where: { id: testTeamId },
      data: { statsDirtyAt: null },
    });

    // 3. L4 confirms duplicate -> keeps canonicalId, sets duplicateOf on duplicateId
    const confirmed = await duplicatesService.confirmDuplicate(
      l4Caller,
      matchedPair.id,
      {
        canonicalClientId: canonicalId,
        reason: 'Verified duplicate during M6 real-DB test',
      },
    );
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.canonicalClientId).toBe(canonicalId);
    expect(confirmed.duplicateClientId).toBe(duplicateId);

    // Both client rows remain in DB (no deletion!), duplicateOf points to canonicalId
    const dupClientRow = await prisma.client.findUnique({
      where: { id: duplicateId },
    });
    const canonClientRow = await prisma.client.findUnique({
      where: { id: canonicalId },
    });
    expect(canonClientRow).toBeDefined();
    expect(canonClientRow!.deletedAt).toBeNull();
    expect(dupClientRow).toBeDefined();
    expect(dupClientRow!.deletedAt).toBeNull();
    expect(dupClientRow!.duplicateOf).toBe(canonicalId);

    // Audit row recorded
    const auditLogs = await prisma.clientAudit.findMany({
      where: { clientId: duplicateId },
      orderBy: { changedAt: 'desc' },
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    expect(
      auditLogs.some((a) => {
        const reason = a.reason ?? '';
        return reason.includes('duplicate') || reason.includes('M6');
      }),
    ).toBe(true);

    // Team marked stats-dirty
    const dirtyTeam = await prisma.team.findUnique({
      where: { id: testTeamId },
    });
    expect(dirtyTeam!.statsDirtyAt).not.toBeNull();

    // 4. Refresh stats & verify duplicateId excluded (2 live canonical/sibling clients vs 3 rows) and zero drift
    await statsRefreshService.refreshStats({ forceAll: true });
    const teamStat = await prisma.teamStat.findUnique({
      where: { teamId: testTeamId },
    });
    expect(teamStat).toBeDefined();
    expect(teamStat!.clientsCount).toBe(2);

    const drift = await statsRefreshService.checkDrift();
    expect(drift.passed).toBe(true);
    expect(drift.clientDrift).toBe(0);
  }, 45000);

  it('REAL DB M6: L4 dismissDuplicate marks candidate dismissed without linking duplicate_of', async () => {
    const l5Caller: ScopeContext = {
      userId: l5UserId,
      role: UserRole.team_member,
      teamId: testTeamId,
      gnId: testGnId,
      dsId: testDsId,
      districtId: testDistrictId,
    };
    const l4Caller: ScopeContext = {
      userId: l4UserId,
      role: UserRole.cdc_secretary,
      teamId: testTeamId,
      gnId: testGnId,
      dsId: testDsId,
      districtId: testDistrictId,
    };

    const twinAId = randomUUID();
    const twinBId = randomUUID();
    createdClientIds.push(twinAId, twinBId);

    const sharedHousePhone = `075${Math.floor(1000000 + Math.random() * 8999999)}`;
    const pushRes = await syncService.pushRecords(l5Caller, {
      device_id: 'm6-dismiss-dev',
      app_version: '2.0.0',
      schema_version: 2,
      records: [
        {
          id: twinAId,
          base_version: 0,
          data: {
            household_id: testHouseId,
            name: 'Kamal Bandara',
            age: 40,
            gender: 'M',
            consent_given: true,
            consent_version: 'consent.v0',
            info_provided_by: 'self',
            phone_raw: sharedHousePhone,
          },
        },
        {
          id: twinBId,
          base_version: 0,
          data: {
            household_id: testHouseId,
            name: 'Amal Bandara',
            age: 40,
            gender: 'M',
            consent_given: true,
            consent_version: 'consent.v0',
            info_provided_by: 'self',
            phone_raw: sharedHousePhone,
          },
        },
      ],
    });
    expect(pushRes.results.every((r) => r.status === 'ok')).toBe(true);

    const openList = await duplicatesService.listDuplicates(l4Caller, {
      status: DuplicateFilterStatus.open,
      teamId: testTeamId,
    });
    const pair = openList.items.find(
      (i) =>
        (i.clientA === twinAId && i.clientB === twinBId) ||
        (i.clientB === twinAId && i.clientA === twinBId),
    );
    expect(pair).toBeDefined();
    if (!pair) {
      throw new Error('Expected open duplicate pair');
    }

    const dismissed = await duplicatesService.dismissDuplicate(
      l4Caller,
      pair.id,
      {
        reason: 'Distinct brothers sharing landline',
      },
    );
    expect(dismissed.status).toBe('dismissed');

    const [rowA, rowB] = await Promise.all([
      prisma.client.findUnique({ where: { id: twinAId } }),
      prisma.client.findUnique({ where: { id: twinBId } }),
    ]);
    expect(rowA!.duplicateOf).toBeNull();
    expect(rowB!.duplicateOf).toBeNull();
  }, 45000);

  it('REAL DB M6: Migration 11 trigram & partial duplicate indexes exist in Postgres catalog', async () => {
    const indexes = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes WHERE tablename IN ('clients', 'duplicate_candidates');`,
    );
    const names = new Set(indexes.map((r) => r.indexname));
    expect(names.has('clients_name_norm_trgm_idx')).toBe(true);
    expect(names.has('clients_duplicate_of_idx')).toBe(true);
    expect(names.has('clients_gn_id_live_idx')).toBe(true);
    expect(names.has('duplicate_candidates_status_score_created_idx')).toBe(
      true,
    );
  });
});
