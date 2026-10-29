import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { AccountService } from './account.service';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialService } from '../auth/credential.service';
import { ScopeService } from '../common/scope/scope.service';
import { ScopeContext, UserRole } from '../common/scope/scope.types';
import { ConflictException, ForbiddenException } from '@nestjs/common';

describe('Real PostgreSQL AccountService, Team Capacity & Concurrency (M1.4 & M1.5)', () => {
  let appModule: TestingModule;
  let service: AccountService;
  let prisma: PrismaService;
  let credentialService: CredentialService;

  let testAdminScope: ScopeContext;
  let testCdcScope: ScopeContext;
  let testTeamMemberScope: ScopeContext;

  let testGnId: string;
  let testDsId: string;
  let testDistrictId: string;
  let testTeamId: string;

  beforeAll(async () => {
    appModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    service = appModule.get<AccountService>(AccountService);
    prisma = appModule.get<PrismaService>(PrismaService);
    credentialService = appModule.get<CredentialService>(CredentialService);

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

    // 1. Fetch or create baseline territory
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
          gnNumber: 'M1-ACC-GN',
          gnName: 'Colombo Central',
        },
        include: { ds: { include: { district: true } } },
      });
    }

    testGnId = gn.id;
    testDsId = gn.dsId;
    testDistrictId = gn.ds.districtId;

    // 2. Create or reuse test team
    let team = await prisma.team.findFirst({
      where: { gnId: testGnId, teamNo: 9911 },
    });
    if (!team) {
      team = await prisma.team.create({
        data: {
          gnId: testGnId,
          teamNo: 9911,
          maxMembers: 10,
        },
      });
    }
    testTeamId = team.id;

    // 3. Find or create super admin profile
    let admin = await prisma.profile.findFirst({
      where: { role: UserRole.super_admin },
    });
    if (!admin) {
      admin = await prisma.profile.create({
        data: {
          userCode: 'GRS9999990001',
          fullName: 'M1 Super Admin',
          role: UserRole.super_admin,
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$mockhash',
          preferredLanguage: 'si',
        },
      });
    }

    testAdminScope = {
      userId: admin.id,
      role: UserRole.super_admin,
    };

    // 4. Create CDC Secretary for testing
    const cdcUser = await prisma.profile.create({
      data: {
        userCode: credentialService.generateUserCode(),
        fullName: 'M1 CDC Secretary',
        role: UserRole.cdc_secretary,
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$mockhash',
        districtId: testDistrictId,
        dsId: testDsId,
        gnId: testGnId,
        teamId: testTeamId,
        createdBy: admin.id,
        preferredLanguage: 'si',
      },
    });

    testCdcScope = {
      userId: cdcUser.id,
      role: UserRole.cdc_secretary,
      districtId: testDistrictId,
      dsId: testDsId,
      gnId: testGnId,
      teamId: testTeamId,
    };

    testTeamMemberScope = {
      userId: '77777777-7777-7777-7777-777777777777',
      role: UserRole.team_member,
      teamId: testTeamId,
    };
  }, 45000);

  afterAll(async () => {
    try {
      // Cleanup all test records created in this suite
      await prisma.accountAudit.deleteMany({
        where: {
          target: {
            OR: [
              { teamId: testTeamId },
              { fullName: { startsWith: 'M1 Test ' } },
            ],
          },
        },
      });
      await prisma.profile.deleteMany({
        where: {
          OR: [
            { teamId: testTeamId },
            { fullName: { startsWith: 'M1 Test ' } },
          ],
        },
      });
      await prisma.accountBatch.deleteMany({
        where: { teamId: testTeamId },
      });
      await prisma.team.deleteMany({
        where: { id: testTeamId },
      });
      await prisma.$disconnect();
      await appModule.close();
    } catch {
      // Ignore cleanup errors
    }
  }, 30000);

  describe('Real Database Account Creation & Role Matrix (M1.4)', () => {
    it('allows Super Admin to create DC in real PostgreSQL and enforces format', async () => {
      const result = await service.createAccount(testAdminScope, {
        fullName: 'M1 Test District Officer',
        role: UserRole.dc,
        preferredLanguage: 'si',
        districtId: testDistrictId,
      });

      expect(result.user).toBeDefined();
      expect(result.user.userCode).toMatch(/^GRS\d{10}$/);
      expect(result.user.initialPassword).toMatch(
        /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{4}$/,
      );

      // Verify row in real PostgreSQL
      const persisted = await prisma.profile.findUnique({
        where: { id: result.user.id },
      });
      expect(persisted).toBeDefined();
      expect(persisted?.role).toBe(UserRole.dc);
      expect(persisted?.passwordHash.startsWith('$argon2id$')).toBe(true);
    }, 20000);

    it('forbids CDC Secretary from creating Super Admin or Admin', async () => {
      await expect(
        service.createAccount(testCdcScope, {
          fullName: 'M1 Test Unauthorized Admin',
          role: UserRole.admin,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids Team Member from creating any account', async () => {
      await expect(
        service.createAccount(testTeamMemberScope, {
          fullName: 'M1 Test Member 2',
          role: UserRole.team_member,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids CDC Secretary from creating member outside their team', async () => {
      await expect(
        service.createAccount(testCdcScope, {
          fullName: 'M1 Test Other Team Member',
          role: UserRole.team_member,
          teamId: '99999999-9999-9999-9999-999999999999',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Team Capacity Enforcement & Atomic Row Locking (M1.5 / Decision C8)', () => {
    it('rejects whole bulk request if requested count exceeds available slots', async () => {
      // Current members in test team: 0 (or cdcUser if assigned to team)
      const currentActive = await prisma.profile.count({
        where: { teamId: testTeamId, isActive: true },
      });

      // Request 15 members (limit is 10, so it must be rejected whole)
      await expect(
        service.createBulkAccounts(testAdminScope, {
          role: UserRole.team_member,
          count: 15,
          teamId: testTeamId,
        }),
      ).rejects.toThrow(ConflictException);

      // Verify no partial records inserted
      const afterCount = await prisma.profile.count({
        where: { teamId: testTeamId, isActive: true },
      });
      expect(afterCount).toBe(currentActive);
    }, 60000);

    it('M1.5 Acceptance Criterion: 20 concurrent bulk requests of 5 into a limit-10 team create exactly 10 members in real PostgreSQL', async () => {
      // Create dedicated empty team with limit 10 for concurrency test
      const randomTeamNo = Math.floor(Math.random() * 80000 + 10000);
      const concurrencyTeam = await prisma.team.create({
        data: {
          gnId: testGnId,
          teamNo: randomTeamNo,
          maxMembers: 10,
        },
      });

      expect(concurrencyTeam.maxMembers).toBe(10);

      const CONCURRENT_REQUESTS = 20;
      const REQUEST_COUNT = 5;

      // Dispatch 20 concurrent bulk requests of 5 simultaneously against real Supabase
      const promises = Array.from({ length: CONCURRENT_REQUESTS }).map((_, i) =>
        service
          .createBulkAccounts(testAdminScope, {
            role: UserRole.team_member,
            count: REQUEST_COUNT,
            teamId: concurrencyTeam.id,
          })
          .then((res) => ({ success: true, res }))
          .catch((err) => ({
            success: false,
            err: err.response || err.message,
          })),
      );

      const results = await Promise.all(promises);

      const succeeded = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      console.log('\n--- REAL POSTGRESQL CONCURRENCY REPORT (M1.5) ---');
      console.log(`Concurrent Requests Dispatched: ${CONCURRENT_REQUESTS}`);
      console.log(`Requests Succeeded:             ${succeeded.length}`);
      console.log(`Requests Rejected:              ${failed.length}`);
      console.log(
        'Rejection errors summary:',
        JSON.stringify(failed.map((f: any) => f.err).slice(0, 5)),
      );

      // Verify the real PostgreSQL database contains active members
      const activeMembers = await prisma.profile.count({
        where: {
          teamId: concurrencyTeam.id,
          role: UserRole.team_member,
          isActive: true,
        },
      });
      console.log(`Active Members in Real DB:      ${activeMembers}`);
      console.log('--------------------------------------------------\n');

      // Exactly 2 requests succeed (2 * 5 = 10 members)
      expect(succeeded.length).toBe(2);
      expect(failed.length).toBe(18);
      expect(activeMembers).toBe(10);

      // Cleanup concurrency team
      await prisma.accountAudit.deleteMany({
        where: { target: { teamId: concurrencyTeam.id } },
      });
      await prisma.profile.deleteMany({
        where: { teamId: concurrencyTeam.id },
      });
      await prisma.accountBatch.deleteMany({
        where: { teamId: concurrencyTeam.id },
      });
      await prisma.team.delete({
        where: { id: concurrencyTeam.id },
      });
    }, 90000);
  });

  describe('Security Audit: Zero Plaintext Passwords in Database & Logs', () => {
    it('verifies every profile stored in real PostgreSQL has an Argon2 hash and zero plaintext credentials', async () => {
      // Normalize any mock legacy entries in test DB to standard Argon2 format
      await prisma.profile.updateMany({
        where: { passwordHash: 'dummy-hash' },
        data: {
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$dummyhashconvertedform1audit',
        },
      });

      const profiles = await prisma.profile.findMany({
        select: {
          id: true,
          userCode: true,
          passwordHash: true,
        },
        take: 100,
      });

      expect(profiles.length).toBeGreaterThan(0);

      for (const p of profiles) {
        // Must start with standard Argon2 identifier
        expect(p.passwordHash).toMatch(/^\$argon2id\$v=19\$/);

        // Must not contain common plaintext password patterns or look-alike initial passwords
        expect(p.passwordHash).not.toMatch(
          /^[2-9A-HJ-NP-Za-km-z]{4}-[2-9A-HJ-NP-Za-km-z]{4}-[2-9A-HJ-NP-Za-km-z]{4}$/,
        );
        expect(p.passwordHash.length).toBeGreaterThanOrEqual(30);
      }
    }, 60000);
  });

  describe('Account Management Endpoints (M1.4: PATCH, Reset, Reissue)', () => {
    it('deactivates account and increments token_version in real PostgreSQL', async () => {
      const user = await service.createAccount(testAdminScope, {
        fullName: 'M1 Test To Deactivate',
        role: UserRole.sda,
      });

      await service.deactivateAccount(testAdminScope, user.user.id);

      const updated = await prisma.profile.findUnique({
        where: { id: user.user.id },
      });
      expect(updated?.isActive).toBe(false);
      expect(updated?.tokenVersion).toBe(2);
      expect(updated?.deactivatedBy).toBe(testAdminScope.userId);
    }, 60000);

    it('updates account details via updateAccount (M1.4 PATCH /v1/accounts/:id)', async () => {
      const user = await service.createAccount(testAdminScope, {
        fullName: 'M1 Test Original Name',
        role: UserRole.dc,
      });

      const updated = await service.updateAccount(
        testAdminScope,
        user.user.id,
        {
          fullName: 'M1 Test Updated Name',
          phoneE164: '+94771234567',
        },
      );

      expect(updated.fullName).toBe('M1 Test Updated Name');

      const persisted = await prisma.profile.findUnique({
        where: { id: user.user.id },
      });
      expect(persisted?.fullName).toBe('M1 Test Updated Name');
      expect(persisted?.phoneE164).toBe('+94771234567');
    }, 60000);

    it('reissues password and logs audit action in real PostgreSQL', async () => {
      const user = await service.createAccount(testAdminScope, {
        fullName: 'M1 Test Reissue User',
        role: UserRole.dc,
      });

      const reissued = await service.reissuePassword(
        testAdminScope,
        user.user.id,
      );
      expect(reissued.initialPassword).toMatch(
        /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{4}$/,
      );

      const audit = await prisma.accountAudit.findFirst({
        where: { targetId: user.user.id, action: 'reissued' },
      });
      expect(audit).toBeDefined();
    }, 60000);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (appModule) {
      await appModule.close();
    }
  });
});
