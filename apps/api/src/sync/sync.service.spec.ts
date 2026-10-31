import { Test, TestingModule } from '@nestjs/testing';
import { SyncService } from './sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { LookupService } from '../lookups/lookup.service';
import { ScopeService } from '../common/scope/scope.service';
import { UserRole } from '../common/scope/scope.types';
import type { ScopeContext } from '../common/scope/scope.types';
import { SyncPushDto } from './dto/sync-push.dto';

describe('SyncService — M3.1 Contract & Scaling Tests (§8.3 & §8.5)', () => {
  let service: SyncService;
  let mockPrisma: any;

  const caller: ScopeContext = {
    userId: '11111111-1111-1111-1111-111111111111',
    role: UserRole.team_member,
    teamId: '22222222-2222-2222-2222-222222222222',
    gnId: '33333333-3333-3333-3333-333333333333',
    dsId: '44444444-4444-4444-4444-444444444444',
    districtId: '55555555-5555-5555-5555-555555555555',
  };

  const validHouseholdId = '66666666-6666-6666-6666-666666666666';

  beforeEach(async () => {
    mockPrisma = {
      client: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      household: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: validHouseholdId,
            teamId: caller.teamId,
            gnId: caller.gnId,
            dsId: caller.dsId,
            districtId: caller.districtId,
            address: '123 Main Street',
            deletedAt: null,
            updatedAt: new Date(),
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      team: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $queryRawUnsafe: jest.fn().mockImplementation(async (sql: string, ...params: any[]) => {
        // Return simulated returning rows for all inserted IDs
        const ids = [];
        for (let i = 0; i < params.length; i += 36) {
          if (params[i]) ids.push(params[i]);
        }
        return ids.map((id) => ({ id, server_version: 1 }));
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        ScopeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LookupService, useValue: { getCategorizedLookups: jest.fn() } },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
  });

  it('Contract Test: Partial Success batch with ok, rejected, forbidden, locked results (§8.3)', async () => {
    const clientIdOk = 'a0000000-0000-0000-0000-000000000001';
    const clientIdRejected = 'a0000000-0000-0000-0000-000000000002';
    const clientIdForbiddenScope = 'a0000000-0000-0000-0000-000000000003';
    const clientIdLocked = 'a0000000-0000-0000-0000-000000000004';

    // Mock existing clients
    mockPrisma.client.findMany.mockResolvedValueOnce([
      {
        id: clientIdLocked,
        collectedBy: caller.userId,
        householdId: validHouseholdId,
        serverVersion: 1,
        contentHash: 'hash-original-old',
      },
    ]);

    // Mock households query: validHouseholdId is in scope, other-household is out of scope
    mockPrisma.household.findMany.mockResolvedValueOnce([
      {
        id: validHouseholdId,
        teamId: caller.teamId,
        gnId: caller.gnId,
        dsId: caller.dsId,
        districtId: caller.districtId,
        address: '123 Main Street',
        deletedAt: null,
      },
      {
        id: '77777777-7777-7777-7777-777777777777',
        teamId: 'other-team-id', // outside caller team
        gnId: caller.gnId,
        dsId: caller.dsId,
        districtId: caller.districtId,
        address: '777 Other Way',
        deletedAt: null,
      },
    ]);

    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      { id: clientIdOk, server_version: 1 },
    ]);

    const dto: SyncPushDto = {
      device_id: 'test-device-1',
      app_version: '2.0.0',
      schema_version: 2,
      records: [
        // 1. Valid record -> ok
        {
          id: clientIdOk,
          base_version: 0,
          data: {
            household_id: validHouseholdId,
            name: 'Sunil Perera',
            age: 32,
            gender: 'M',
            phone_raw: '0771234567',
            future_hopes: ['local_job'],
            info_provided_by: 'self',
            consent_given: true,
          },
        },
        // 2. Invalid record (no consent) -> rejected
        {
          id: clientIdRejected,
          base_version: 0,
          data: {
            household_id: validHouseholdId,
            name: 'Kamal Silva',
            age: 25,
            gender: 'M',
            consent_given: false,
          },
        },
        // 3. Out of scope household -> forbidden
        {
          id: clientIdForbiddenScope,
          base_version: 0,
          data: {
            household_id: '77777777-7777-7777-7777-777777777777',
            name: 'Nimal Bandara',
            age: 40,
            gender: 'M',
            info_provided_by: 'self',
            consent_given: true,
          },
        },
        // 4. Existing confirmed record (base_version >= 1) edited by Level 5 -> locked
        {
          id: clientIdLocked,
          base_version: 1,
          data: {
            household_id: validHouseholdId,
            name: 'Updated Sunil',
            age: 33,
            gender: 'M',
            info_provided_by: 'self',
            consent_given: true,
          },
        },
      ],
    };

    const res = await service.pushRecords(caller, dto);
    expect(res.results.length).toBe(4);

    const rOk = res.results.find((r) => r.id === clientIdOk);
    const rRejected = res.results.find((r) => r.id === clientIdRejected);
    const rForbidden = res.results.find((r) => r.id === clientIdForbiddenScope);
    const rLocked = res.results.find((r) => r.id === clientIdLocked);

    expect(rOk?.status).toBe('ok');
    expect(rOk?.server_version).toBe(1);

    expect(rRejected?.status).toBe('rejected');
    expect(rRejected?.code).toBe('CONSENT_REQUIRED');

    expect(rForbidden?.status).toBe('forbidden');
    expect(rForbidden?.code).toBe('HOUSEHOLD_OUT_OF_SCOPE');

    expect(rLocked?.status).toBe('locked');
    expect(rLocked?.code).toBe('RECORD_LOCKED');
  });

  it('Scaling Invariant: A 50-record batch uses <= 3 database queries (M3.1 Done When)', async () => {
    // Generate 50 valid client records
    const records = [];
    for (let i = 1; i <= 50; i++) {
      const hex = i.toString(16).padStart(12, '0');
      records.push({
        id: `b0000000-0000-0000-0000-${hex}`,
        base_version: 0,
        data: {
          household_id: validHouseholdId,
          name: `Batch Member ${i}`,
          age: 20 + (i % 30),
          gender: i % 2 === 0 ? 'M' : 'F',
          phone_raw: '0712345678',
          future_hopes: ['local_job'],
          info_provided_by: 'self',
          consent_given: true,
        },
      });
    }

    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce(
      records.map((r) => ({ id: r.id, server_version: 1 })),
    );

    const dto: SyncPushDto = {
      device_id: 'batch-device-50',
      app_version: '2.0.0',
      schema_version: 2,
      records,
    };

    const res = await service.pushRecords(caller, dto);
    expect(res.results.length).toBe(50);
    expect(res.results.every((r) => r.status === 'ok')).toBe(true);

    // Count Prisma calls
    const clientFindManyCalls = mockPrisma.client.findMany.mock.calls.length;
    const householdFindManyCalls = mockPrisma.household.findMany.mock.calls.length;
    const rawSqlUpsertCalls = mockPrisma.$queryRawUnsafe.mock.calls.length;
    const totalBatchQueries = clientFindManyCalls + householdFindManyCalls + rawSqlUpsertCalls;

    expect(clientFindManyCalls).toBe(1); // Query 1: load existing clients
    expect(householdFindManyCalls).toBe(1); // Query 2: load households
    expect(rawSqlUpsertCalls).toBe(1); // Query 3: single bulk upsert
    expect(totalBatchQueries).toBeLessThanOrEqual(3);
  });

  it('Idempotency: Retry after lost response (same content hash) returns ok without conflict (§8.3 & §12.4 #15)', async () => {
    const clientId = 'c0000000-0000-0000-0000-000000000001';
    const clientData = {
      household_id: validHouseholdId,
      name: 'Anura Kumara',
      age: 45,
      gender: 'M',
      phone_raw: '0779998877',
      future_hopes: ['local_job'],
      info_provided_by: 'self',
      consent_given: true,
    };

    const contentHash = SyncService.computeContentHash({
      householdId: validHouseholdId,
      name: 'Anura Kumara',
      age: 45,
      gender: 'M',
      phoneE164: '+94779998877',
      futureHopes: ['local_job'],
      infoProvidedBy: 'self',
      consentGiven: true,
    });

    mockPrisma.client.findMany.mockResolvedValueOnce([
      {
        id: clientId,
        collectedBy: caller.userId,
        householdId: validHouseholdId,
        serverVersion: 3,
        contentHash,
      },
    ]);

    const dto: SyncPushDto = {
      device_id: 'phone-retry',
      app_version: '2.0.0',
      schema_version: 2,
      records: [
        {
          id: clientId,
          base_version: 0,
          data: clientData,
        },
      ],
    };

    const res = await service.pushRecords(caller, dto);
    expect(res.results.length).toBe(1);
    expect(res.results[0].status).toBe('ok');
    expect(res.results[0].server_version).toBe(3);
    // When all items in batch are identical retries, raw SQL query is skipped
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('Incremental Changes: GET /v1/sync/changes returns updated and deleted households', async () => {
    const mockUpdatedHouseholds = [
      {
        id: 'house-updated-1',
        gnId: caller.gnId,
        teamId: caller.teamId,
        districtId: caller.districtId,
        dsId: caller.dsId,
        serialNo: 10,
        houseNo: 'HN-10',
        houseNoNorm: 'HN-10',
        houseLeaderName: 'Leader 10',
        address: '10 High Street',
        villageName: 'Sample Village',
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
        version: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const mockDeletedHouseholds = [
      {
        id: 'house-deleted-2',
        deletedAt: new Date(),
        deletedReason: 'Demolished',
      },
    ];

    mockPrisma.household.findMany
      .mockResolvedValueOnce(mockUpdatedHouseholds)
      .mockResolvedValueOnce(mockDeletedHouseholds);

    const changes = await service.getChanges(caller, '2026-10-30T00:00:00Z');
    expect(changes.serverTime).toBeDefined();
    expect(changes.households.length).toBe(1);
    expect(changes.households[0].id).toBe('house-updated-1');
    expect(changes.deletedHouseholds.length).toBe(1);
    expect(changes.deletedHouseholds[0].id).toBe('house-deleted-2');
  });
});
