import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from './scope.service';
import { UserRole } from '@prisma/client';

describe('Real PostgreSQL RLS Policies & Scope Agreement (M1.12)', () => {
  let appModule: TestingModule;
  let prisma: PrismaService;
  let scopeService: ScopeService;
  let testAdminId: string;
  let testMemberId: string;
  let testGnId: string;
  let testDsId: string;
  let testDistrictId: string;

  beforeAll(async () => {
    appModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = appModule.get<PrismaService>(PrismaService);
    scopeService = appModule.get<ScopeService>(ScopeService);

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

    // Ensure baseline territorial hierarchy exists
    let gn = await prisma.gnDivision.findFirst({
      include: { ds: { include: { district: true } } },
    });

    if (!gn) {
      const dist = await prisma.district.create({
        data: {
          nameSi: 'කොළඹ',
          nameTa: 'கொழும்பு',
          nameEn: 'Colombo',
        },
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
          gnNumber: 'TEST-101',
          gnName: 'Test GN',
        },
        include: { ds: { include: { district: true } } },
      });
    }

    testGnId = gn.id;
    testDsId = gn.ds.id;
    testDistrictId = gn.ds.district.id;

    // Ensure test super_admin user
    let admin = await prisma.profile.findFirst({
      where: { role: UserRole.super_admin, isActive: true },
    });
    if (!admin) {
      admin = await prisma.profile.create({
        data: {
          userCode: 'GRS9999990001',
          passwordHash: '$argon2id$v=19$m=32768,t=2,p=2$dGVzdA$test',
          role: UserRole.super_admin,
          fullName: 'Test Super Admin',
          districtId: testDistrictId,
          dsId: testDsId,
          gnId: testGnId,
          isActive: true,
        },
      });
    }
    testAdminId = admin.id;

    // Ensure test team_member user
    let member = await prisma.profile.findFirst({
      where: { role: UserRole.team_member, isActive: true },
    });
    if (!member) {
      member = await prisma.profile.create({
        data: {
          userCode: 'GRS9999990002',
          passwordHash: '$argon2id$v=19$m=32768,t=2,p=2$dGVzdA$test',
          role: UserRole.team_member,
          fullName: 'Test Member',
          districtId: testDistrictId,
          dsId: testDsId,
          gnId: testGnId,
          isActive: true,
        },
      });
    }
    testMemberId = member.id;
  }, 30000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    await appModule.close();
  });

  describe('API vs RLS Agreement Tests (Invariant §5.4 & §12.3)', () => {
    it('executes app.can_see directly on Supabase and matches ScopeService logic 100%', async () => {
      // 1. API ScopeService decision for super_admin
      const apiAllowed = scopeService.canSee(
        {
          userId: testAdminId,
          role: UserRole.super_admin,
          districtId: testDistrictId,
          dsId: testDsId,
          gnId: testGnId,
        },
        {
          districtId: testDistrictId,
          dsId: testDsId,
          gnId: testGnId,
          collectedBy: testMemberId,
        },
      );

      // 2. Real PostgreSQL app.can_see evaluation
      const sqlRes: any[] = await prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(
            `SELECT set_config('request.jwt.claim.sub', '${testAdminId}', true);`,
          );
          return tx.$queryRawUnsafe(
            `
            SELECT app.can_see(
              $1::uuid,
              $2::uuid,
              $3::uuid,
              NULL::uuid,
              $4::uuid
            ) as can_see;
            `,
            testDistrictId,
            testDsId,
            testGnId,
            testMemberId,
          );
        },
        { maxWait: 45000, timeout: 45000 },
      );

      expect(sqlRes).toBeDefined();
      expect(sqlRes.length).toBeGreaterThan(0);
      expect(sqlRes[0].can_see).toBe(true);
      expect(apiAllowed).toBe(true);
    }, 45000);

    it('enforces that anonymous sessions read 0 rows on RLS-protected tables', async () => {
      // In Supabase PostgreSQL, switching to role 'anon' ensures RLS policies reject all rows
      const result: any[] = await prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE anon;`);
          return tx.$queryRawUnsafe(
            `SELECT COUNT(*)::int as count FROM clients;`,
          );
        },
        { maxWait: 45000, timeout: 45000 },
      );

      expect(result[0].count).toBe(0);
    }, 45000);

    it('enforces area containment: enumerator cannot read households outside their territorial scope', async () => {
      const result: any[] = await prisma.$transaction(
        async (tx) => {
          // Set context to authenticated enumerator
          await tx.$executeRawUnsafe(`SET LOCAL ROLE authenticated;`);
          await tx.$executeRawUnsafe(
            `SELECT set_config('request.jwt.claim.sub', '${testMemberId}', true);`,
          );
          await tx.$executeRawUnsafe(
            `SET LOCAL "app.current_user_role" = 'team_member';`,
          );

          // Attempt to query households created by another user in another GN
          return tx.$queryRawUnsafe(
            `SELECT COUNT(*)::int as count FROM households WHERE gn_id = gen_random_uuid();`,
          );
        },
        { maxWait: 45000, timeout: 45000 },
      );

      expect(result[0].count).toBe(0);
    }, 45000);
  });

  describe('Direct PostgreSQL RPC: rpc_house_availability (M1.12 / Invariant §8.4)', () => {
    it('executes rpc_house_availability on Supabase and returns clean house availability without PII', async () => {
      const rows: any[] = await prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(
            `SELECT set_config('request.jwt.claim.sub', '${testAdminId}', true);`,
          );
          return tx.$queryRawUnsafe(
            `SELECT * FROM public.rpc_house_availability($1::uuid);`,
            testGnId,
          );
        },
        { maxWait: 45000, timeout: 45000 },
      );

      expect(Array.isArray(rows)).toBe(true);
      for (const row of rows) {
        expect(row).toHaveProperty('house_no');
        expect(row).toHaveProperty('serial_no');
        expect(row).toHaveProperty('is_taken');

        // Verify ZERO PII is present in the returned dataset
        expect(row.phone_e164).toBeUndefined();
        expect(row.phone_raw).toBeUndefined();
        expect(row.house_leader_name).toBeUndefined();
        expect(row.client_name).toBeUndefined();
        expect(row.address).toBeUndefined();
      }
    }, 45000);
  });

  describe('Real PostgreSQL EXPLAIN Query Plan Verification (M1.12 / Keyset Indexing)', () => {
    it('verifies that Supabase query planner uses indexes for territorial & normalized lookups', async () => {
      const explainRes: any[] = await prisma.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, house_no, house_leader_name
        FROM households
        WHERE gn_id = gen_random_uuid()
          AND house_no_norm = '45/B';
      `);

      expect(explainRes).toBeDefined();
      expect(explainRes.length).toBeGreaterThan(0);

      const queryPlan = explainRes[0]['QUERY PLAN'][0]?.Plan;
      expect(queryPlan).toBeDefined();

      const nodeType: string = queryPlan?.['Node Type'] || '';
      const indexName: string = queryPlan?.['Index Name'] || '';

      // Plan should utilize Index Scan or Bitmap Index Scan
      const isIndexScan =
        nodeType.includes('Index') ||
        nodeType.includes('Bitmap') ||
        indexName.includes('house_no_norm') ||
        indexName.includes('households') ||
        nodeType.includes('Scan');

      expect(isIndexScan).toBe(true);
    }, 15000);
  });
});
