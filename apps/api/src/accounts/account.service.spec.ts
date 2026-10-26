import { Test, TestingModule } from '@nestjs/testing';
import { AccountService } from './account.service';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialService } from '../auth/credential.service';
import { ScopeService } from '../common/scope/scope.service';
import { ScopeContext, UserRole } from '../common/scope/scope.types';
import { ConflictException, ForbiddenException } from '@nestjs/common';

describe('AccountService & Team Capacity Enforcement (M1.4 & M1.5)', () => {
  let service: AccountService;
  let credentialService: CredentialService;

  const mockAdminScope: ScopeContext = {
    userId: '11111111-1111-1111-1111-111111111111',
    role: UserRole.super_admin,
  };

  const mockCdcScope: ScopeContext = {
    userId: '22222222-2222-2222-2222-222222222222',
    role: UserRole.cdc_secretary,
    districtId: '33333333-3333-3333-3333-333333333333',
    dsId: '44444444-4444-4444-4444-444444444444',
    gnId: '55555555-5555-5555-5555-555555555555',
    teamId: '66666666-6666-6666-6666-666666666666',
  };

  const mockTeamMemberScope: ScopeContext = {
    userId: '77777777-7777-7777-7777-777777777777',
    role: UserRole.team_member,
    teamId: '66666666-6666-6666-6666-666666666666',
  };

  // In-memory mock storage to accurately test atomic locking & concurrency
  let inMemoryProfiles: any[] = [];
  let inMemoryBatches: any[] = [];
  let inMemoryAudits: any[] = [];
  let teamMemberLimit = 10;
  let activeTeamLock: Promise<void> | null = null;

  const createMockPrisma = () => {
    return {
      profile: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id) {
            return Promise.resolve(inMemoryProfiles.find((p) => p.id === where.id) || null);
          }
          if (where.userCode) {
            return Promise.resolve(inMemoryProfiles.find((p) => p.userCode === where.userCode) || null);
          }
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockImplementation(() => Promise.resolve(inMemoryProfiles)),
        count: jest.fn().mockImplementation(({ where }) => {
          let filtered = inMemoryProfiles;
          if (where?.teamId) filtered = filtered.filter((p) => p.teamId === where.teamId);
          if (where?.isActive !== undefined) filtered = filtered.filter((p) => p.isActive === where.isActive);
          return Promise.resolve(filtered.length);
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const profile = {
            id: `p-${Date.now()}-${Math.random()}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            tokenVersion: 1,
          };
          inMemoryProfiles.push(profile);
          return Promise.resolve(profile);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const idx = inMemoryProfiles.findIndex((p) => p.id === where.id);
          if (idx !== -1) {
            inMemoryProfiles[idx] = {
              ...inMemoryProfiles[idx],
              ...data,
              tokenVersion: data.tokenVersion?.increment
                ? inMemoryProfiles[idx].tokenVersion + 1
                : inMemoryProfiles[idx].tokenVersion,
            };
            return Promise.resolve(inMemoryProfiles[idx]);
          }
          return Promise.resolve(null);
        }),
      },
      accountBatch: {
        create: jest.fn().mockImplementation(({ data }) => {
          const batch = {
            id: `b-${Date.now()}-${Math.random()}`,
            ...data,
            createdAt: new Date(),
          };
          inMemoryBatches.push(batch);
          return Promise.resolve(batch);
        }),
      },
      accountAudit: {
        create: jest.fn().mockImplementation(({ data }) => {
          const audit = {
            id: `a-${Date.now()}-${Math.random()}`,
            ...data,
            at: new Date(),
          };
          inMemoryAudits.push(audit);
          return Promise.resolve(audit);
        }),
      },
      refreshToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $queryRaw: jest.fn().mockImplementation(async () => {
        return [
          {
            id: mockCdcScope.teamId,
            max_members: teamMemberLimit,
            gn_id: mockCdcScope.gnId,
          },
        ];
      }),
      $transaction: jest.fn().mockImplementation(async (callback: any) => {
        // Mutex lock simulating PostgreSQL SELECT ... FOR UPDATE row-level lock
        let releaseLock: () => void;
        const currentLock = activeTeamLock;
        let lockAcquired: () => void;
        const newLock = new Promise<void>((resolve) => {
          lockAcquired = resolve;
        });
        activeTeamLock = new Promise<void>((resolve) => {
          releaseLock = resolve;
        });

        if (currentLock) {
          await currentLock;
        }

        try {
          const txMock = {
            ...mockPrisma,
            $queryRaw: mockPrisma.$queryRaw,
          };
          const result = await callback(txMock);
          return result;
        } finally {
          releaseLock!();
          if (activeTeamLock === currentLock) {
            activeTeamLock = null;
          }
        }
      }),
    };
  };

  let mockPrisma: any;

  beforeEach(async () => {
    inMemoryProfiles = [];
    inMemoryBatches = [];
    inMemoryAudits = [];
    teamMemberLimit = 10;
    activeTeamLock = null;

    mockPrisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        CredentialService,
        ScopeService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AccountService>(AccountService);
    credentialService = module.get<CredentialService>(CredentialService);
  });

  describe('Single Account Creation & Role Matrix', () => {
    it('allows Super Admin to create any role', async () => {
      const result = await service.createAccount(mockAdminScope, {
        fullName: 'District Officer',
        role: UserRole.dc,
        preferredLanguage: 'si',
      });

      expect(result.user).toBeDefined();
      expect(result.user.userCode).toMatch(/^GRS\d{10}$/);
      expect(result.user.initialPassword).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{4}$/);
      expect(result.user.role).toBe(UserRole.dc);
    });

    it('forbids CDC Secretary from creating Super Admin or Admin', async () => {
      await expect(
        service.createAccount(mockCdcScope, {
          fullName: 'Unauthorized Admin',
          role: UserRole.admin,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids Team Member from creating any account', async () => {
      await expect(
        service.createAccount(mockTeamMemberScope, {
          fullName: 'Member 2',
          role: UserRole.team_member,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids CDC Secretary from creating member outside their team', async () => {
      await expect(
        service.createAccount(mockCdcScope, {
          fullName: 'Other Team Member',
          role: UserRole.team_member,
          teamId: '99999999-9999-9999-9999-999999999999',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Team Member Limit Enforcement & Concurrency (M1.5 / Decision C8)', () => {
    it('rejects whole bulk request if requested count exceeds available slots', async () => {
      // Pre-fill 8 active members in a limit-10 team
      for (let i = 0; i < 8; i++) {
        inMemoryProfiles.push({
          id: `existing-${i}`,
          teamId: mockCdcScope.teamId,
          isActive: true,
        });
      }

      // Request 5 members (only 2 slots available)
      await expect(
        service.createBulkAccounts(mockCdcScope, {
          role: UserRole.team_member,
          count: 5,
          teamId: mockCdcScope.teamId!,
        }),
      ).rejects.toThrow(ConflictException);

      try {
        await service.createBulkAccounts(mockCdcScope, {
          role: UserRole.team_member,
          count: 5,
          teamId: mockCdcScope.teamId!,
        });
      } catch (err: any) {
        expect(err.response.code).toBe('TEAM_MEMBER_LIMIT_EXCEEDED');
        expect(err.response.availableSlots).toBe(2);
        expect(err.response.requestedCount).toBe(5);
        expect(err.response.currentMembers).toBe(8);
      }

      // Assert request was rejected WHOLE (no partial inserts: still exactly 8 members)
      expect(inMemoryProfiles.length).toBe(8);
    });

    it('M1.5 Acceptance Criterion: 20 concurrent bulk requests of 5 into a limit-10 team create exactly 10 members, rejected requests are whole', async () => {
      // Team is empty, limit is 10
      teamMemberLimit = 10;
      expect(inMemoryProfiles.length).toBe(0);

      const CONCURRENT_REQUESTS = 20;
      const REQUEST_COUNT = 5;

      // Dispatch 20 concurrent bulk requests of 5 simultaneously
      const promises = Array.from({ length: CONCURRENT_REQUESTS }).map(() =>
        service
          .createBulkAccounts(mockCdcScope, {
            role: UserRole.team_member,
            count: REQUEST_COUNT,
            teamId: mockCdcScope.teamId!,
          })
          .then((res) => ({ success: true, res }))
          .catch((err) => ({ success: false, err })),
      );

      const results = await Promise.all(promises);

      const succeeded = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      // Exactly 2 requests succeed (2 * 5 = 10 members)
      expect(succeeded.length).toBe(2);

      // Exactly 18 requests fail
      expect(failed.length).toBe(18);

      // Total profiles in team is exactly 10
      const activeTeamMembers = inMemoryProfiles.filter(
        (p) => p.teamId === mockCdcScope.teamId && p.isActive,
      );
      expect(activeTeamMembers.length).toBe(10);

      // Every rejected request failed WHOLE with availableSlots = 0
      failed.forEach((f: any) => {
        expect(f.err.response.code).toBe('TEAM_MEMBER_LIMIT_EXCEEDED');
        expect(f.err.response.availableSlots).toBe(0);
        expect(f.err.response.currentMembers).toBe(10);
      });
    });
  });

  describe('Deactivation & Reissue (M1.4 & Decision C14/C18)', () => {
    it('allows Super Admin to deactivate lower rank, incrementing token_version', async () => {
      const user = await service.createAccount(mockAdminScope, {
        fullName: 'To Deactivate',
        role: UserRole.cdc_secretary,
      });

      await service.deactivateAccount(mockAdminScope, user.user.id);

      const updated = inMemoryProfiles.find((p) => p.id === user.user.id);
      expect(updated.isActive).toBe(false);
      expect(updated.tokenVersion).toBe(2);
      expect(updated.deactivatedBy).toBe(mockAdminScope.userId);
    });

    it('forbids CDC Secretary from deactivating higher or equal rank', async () => {
      const admin = await service.createAccount(mockAdminScope, {
        fullName: 'Another Admin',
        role: UserRole.admin,
      });

      await expect(
        service.deactivateAccount(mockCdcScope, admin.user.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('reissues initial password and logs audit action', async () => {
      const created = await service.createAccount(mockCdcScope, {
        fullName: 'Lost Credential Member',
        role: UserRole.team_member,
        teamId: mockCdcScope.teamId!,
      });

      const reissued = await service.reissuePassword(
        mockCdcScope,
        created.user.id,
      );

      expect(reissued.initialPassword).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{4}$/);
      expect(reissued.expiresAt.getTime()).toBeGreaterThan(Date.now());

      const audit = inMemoryAudits.find(
        (a) => a.targetId === created.user.id && a.action === 'reissued',
      );
      expect(audit).toBeDefined();
    });
  });
});
