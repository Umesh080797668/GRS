import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AccountService } from './account.service';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialService } from '../auth/credential.service';
import { ScopeService } from '../common/scope/scope.service';
import { ScopeContext, UserRole } from '../common/scope/scope.types';

describe('Account Creation & Bulk Generation for Level 4 CDC Admin & Team Members', () => {
  let service: AccountService;
  let mockPrisma: any;
  let mockCredentialService: any;

  const mockTeam = {
    id: 'team-4444-4444-4444-444444444444',
    teamNo: 1,
    leaderId: null,
    gnId: 'gn-3333-3333-3333-333333333333',
    gn: {
      id: 'gn-3333-3333-3333-333333333333',
      dsId: 'ds-2222-2222-2222-222222222222',
      ds: {
        id: 'ds-2222-2222-2222-222222222222',
        districtId: 'dist-1111-1111-1111-111111111111',
      },
    },
  };

  const superAdminScope: ScopeContext = {
    userId: 'admin-1111-1111-1111-111111111111',
    role: UserRole.super_admin,
  };

  const sdaScope: ScopeContext = {
    userId: 'sda-2222-2222-2222-222222222222',
    role: UserRole.sda,
    districtId: 'dist-1111-1111-1111-111111111111',
    dsId: 'ds-2222-2222-2222-222222222222',
  };

  beforeEach(async () => {
    mockPrisma = {
      profile: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'mock-profile-id',
            ...data,
          }),
        ),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({ id: where.id, ...data }),
        ),
        delete: jest.fn().mockResolvedValue({}),
      },
      accountBatch: {
        create: jest.fn().mockResolvedValue({ id: 'batch-mock-id' }),
        count: jest.fn().mockResolvedValue(0),
      },
      accountAudit: {
        create: jest.fn().mockResolvedValue({ id: 'audit-mock-id' }),
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      client: { count: jest.fn().mockResolvedValue(0) },
      household: { count: jest.fn().mockResolvedValue(0) },
      exportJob: { count: jest.fn().mockResolvedValue(0) },
      accountAssignment: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      profileAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      refreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userSession: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      emailCode: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      gnDivision: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      team: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === mockTeam.id) {
            return Promise.resolve({ ...mockTeam });
          }
          return Promise.resolve(null);
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => {
        return cb(mockPrisma);
      }),
    };

    mockCredentialService = {
      generateUserCode: jest.fn().mockReturnValue('GRS1234567890'),
      generateInitialPassword: jest.fn().mockReturnValue({
        raw: 'RawPass1234!',
        display: 'XXXX-YYYY-ZZZZ',
      }),
      hashInitialPassword: jest.fn().mockResolvedValue('$argon2id$mockedhash'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: CredentialService,
          useValue: mockCredentialService,
        },
        {
          provide: ScopeService,
          useValue: new ScopeService(),
        },
      ],
    }).compile();

    service = module.get<AccountService>(AccountService);
  });

  describe('Bulk CDC Admin (Level 4 CDC Secretary) Creation', () => {
    it('rejects bulk CDC Secretary creation without a teamId for non-national creator (SDA)', async () => {
      await expect(
        service.createBulkAccounts(sdaScope, {
          role: UserRole.cdc_secretary,
          count: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows Super Admin to bulk create CDC Secretary accounts without a teamId (pre-staging)', async () => {
      const result = await service.createBulkAccounts(superAdminScope, {
        role: UserRole.cdc_secretary,
        count: 5,
      });

      expect(result.batchId).toBe('batch-mock-id');
      expect(result.users).toHaveLength(5);
      expect(result.users[0].role).toBe(UserRole.cdc_secretary);
      expect(result.users[0].fullName).toBe('CDC Secretary 1');
      expect(result.users[0].teamId).toBeUndefined();
    });

    it('rejects bulk CDC Secretary creation with teamId and count !== 1', async () => {
      await expect(
        service.createBulkAccounts(superAdminScope, {
          role: UserRole.cdc_secretary,
          count: 2,
          teamId: mockTeam.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows Super Admin to bulk create CDC Secretary with teamId and count = 1, and updates team leader', async () => {
      const result = await service.createBulkAccounts(superAdminScope, {
        role: UserRole.cdc_secretary,
        count: 1,
        teamId: mockTeam.id,
      });

      expect(result.batchId).toBe('batch-mock-id');
      expect(result.users).toHaveLength(1);
      expect(result.users[0].role).toBe(UserRole.cdc_secretary);
      expect(result.users[0].fullName).toBe('CDC Secretary 1');
      expect(result.users[0].teamId).toBe(mockTeam.id);
      expect(mockPrisma.team.update).toHaveBeenCalledWith({
        where: { id: mockTeam.id },
        data: { leaderId: 'mock-profile-id' },
      });
    });

    it('allows SDA to bulk create CDC Secretary in their division with a teamId', async () => {
      const result = await service.createBulkAccounts(sdaScope, {
        role: UserRole.cdc_secretary,
        count: 1,
        teamId: mockTeam.id,
      });

      expect(result.batchId).toBe('batch-mock-id');
      expect(result.users).toHaveLength(1);
      expect(result.users[0].role).toBe(UserRole.cdc_secretary);
      expect(mockPrisma.team.update).toHaveBeenCalledWith({
        where: { id: mockTeam.id },
        data: { leaderId: 'mock-profile-id' },
      });
    });

    it('rejects bulk CDC Secretary if team already has an active leader', async () => {
      mockPrisma.team.findUnique.mockResolvedValueOnce({
        ...mockTeam,
        leaderId: 'existing-leader-id',
      });
      mockPrisma.profile.findFirst.mockResolvedValueOnce({
        id: 'existing-leader-id',
        isActive: true,
      });

      await expect(
        service.createBulkAccounts(superAdminScope, {
          role: UserRole.cdc_secretary,
          count: 1,
          teamId: mockTeam.id,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Single Account Creation', () => {
    it('allows Super Admin to create a single CDC Secretary account without a teamId (pre-staging)', async () => {
      const result = await service.createAccount(superAdminScope, {
        fullName: 'Sunil CDC Secretary',
        role: UserRole.cdc_secretary,
      });

      expect(result.user).toBeDefined();
      expect(result.user.role).toBe(UserRole.cdc_secretary);
      expect(result.user.fullName).toBe('Sunil CDC Secretary');
      expect(result.user.teamId).toBeUndefined();
    });

    it('allows Super Admin to create a single CDC Secretary account with teamId and updates team leader', async () => {
      const result = await service.createAccount(superAdminScope, {
        fullName: 'Sunil CDC Secretary',
        role: UserRole.cdc_secretary,
        teamId: mockTeam.id,
      });

      expect(result.user).toBeDefined();
      expect(result.user.role).toBe(UserRole.cdc_secretary);
      expect(result.user.fullName).toBe('Sunil CDC Secretary');
      expect(result.user.teamId).toBe(mockTeam.id);
      expect(mockPrisma.team.update).toHaveBeenCalledWith({
        where: { id: mockTeam.id },
        data: { leaderId: 'mock-profile-id' },
      });
    });

    it('rejects single CDC Secretary creation without a teamId when created by non-national creator (SDA)', async () => {
      await expect(
        service.createAccount(sdaScope, {
          fullName: 'Sunil CDC Secretary',
          role: UserRole.cdc_secretary,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Bulk Members Array & Count Handling', () => {
    it('rejects bulk creation when members array length exceeds count', async () => {
      await expect(
        service.createBulkAccounts(superAdminScope, {
          role: UserRole.team_member,
          count: 2,
          members: [
            { fullName: 'Member 1' },
            { fullName: 'Member 2' },
            { fullName: 'Member 3' },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses member-provided fullName when available and formats default name by role', async () => {
      const result = await service.createBulkAccounts(superAdminScope, {
        role: UserRole.team_member,
        count: 3,
        members: [{ fullName: 'Kasun Perera' }],
      });

      expect(result.users).toHaveLength(3);
      expect(result.users[0].fullName).toBe('Kasun Perera');
      expect(result.users[1].fullName).toBe('Team Member 2');
      expect(result.users[2].fullName).toBe('Team Member 3');
    });
  });

  describe('Phone Normalization & Validation', () => {
    it('normalizes valid Sri Lankan local phone number in bulk member info', async () => {
      const result = await service.createBulkAccounts(superAdminScope, {
        role: UserRole.team_member,
        count: 1,
        members: [{
          phoneE164: '0771234567',
          fullName: ''
        }],
      });

      expect(result.users).toHaveLength(1);
      expect(mockPrisma.profile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phoneE164: '+94771234567',
          }),
        }),
      );
    });

    it('rejects invalid phone number in bulk member info', async () => {
      await expect(
        service.createBulkAccounts(superAdminScope, {
          role: UserRole.team_member,
          count: 1,
          members: [{
            phoneE164: 'not-a-valid-phone',
            fullName: ''
          }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('normalizes valid phone in single account creation', async () => {
      await service.createAccount(superAdminScope, {
        fullName: 'Kamal Silva',
        role: UserRole.team_member,
        phoneE164: '0712345678',
      });

      expect(mockPrisma.profile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phoneE164: '+94712345678',
          }),
        }),
      );
    });

    it('rejects invalid phone in single account creation', async () => {
      await expect(
        service.createAccount(superAdminScope, {
          fullName: 'Kamal Silva',
          role: UserRole.team_member,
          phoneE164: '12345',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Account Update & Delete', () => {
    it('deletes clean unused subordinate account and blocks accounts with collected/audit history', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({
        id: 'target-user-1',
        userCode: 'GRS1111111111',
        fullName: 'Member One',
        role: UserRole.team_member,
        teamId: mockTeam.id,
        gnId: mockTeam.gnId,
        dsId: mockTeam.gn.dsId,
        districtId: mockTeam.gn.ds.districtId,
        isActive: true,
      });

      const deleted = await service.deleteAccount(
        superAdminScope,
        'target-user-1',
      );
      expect(deleted).toEqual({ success: true, id: 'target-user-1' });
      expect(mockPrisma.profile.delete).toHaveBeenCalledWith({
        where: { id: 'target-user-1' },
      });

      // Block if account has collected clients
      mockPrisma.client.count.mockResolvedValueOnce(2);
      await expect(
        service.deleteAccount(superAdminScope, 'target-user-1'),
      ).rejects.toThrow(ConflictException);

      // Block self-delete
      await expect(
        service.deleteAccount(superAdminScope, superAdminScope.userId),
      ).rejects.toThrow('Cannot delete your own account');
    });

    it('updates fullName, normalized phoneE164, and preferredLanguage', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({
        id: 'target-user-2',
        userCode: 'GRS2222222222',
        fullName: 'Old Name',
        role: UserRole.team_member,
        teamId: mockTeam.id,
        gnId: mockTeam.gnId,
        dsId: mockTeam.gn.dsId,
        districtId: mockTeam.gn.ds.districtId,
        isActive: true,
      });

      const res = await service.updateAccount(superAdminScope, 'target-user-2', {
        fullName: 'New Member Name',
        phoneE164: '0779876543',
        preferredLanguage: 'en',
      });
      expect(res.fullName).toBe('New Member Name');
      expect(res.phoneE164).toBe('+94779876543');
      expect(res.preferredLanguage).toBe('en');
    });
  });
});
