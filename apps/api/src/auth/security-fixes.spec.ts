/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { ConfigService } from '@nestjs/config';
import {
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtStrategy, JwtPayload } from './jwt.strategy';
import { CredentialService } from './credential.service';
import { AccountService } from '../accounts/account.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope/scope.service';
import { UserRole } from '../common/scope/scope.types';

describe('Security Vulnerability Fixes Verification', () => {
  describe('1. Missing JWT_ACCESS_SECRET & Scope Restriction (jwt.strategy.ts)', () => {
    it('throws fatal error at startup if JWT_ACCESS_SECRET is missing', () => {
      const mockConfig = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;
      const mockPrisma = {} as PrismaService;

      expect(() => new JwtStrategy(mockConfig, mockPrisma)).toThrow(
        'CRITICAL SECURITY ERROR: JWT_ACCESS_SECRET is not configured',
      );
    });

    it('rejects scope: change-password token on non-change-password endpoints', async () => {
      const mockConfig = {
        get: jest
          .fn()
          .mockImplementation((key) =>
            key === 'JWT_ACCESS_SECRET' ? 'test-secret' : undefined,
          ),
      } as unknown as ConfigService;
      const mockPrisma = {
        profile: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'u1',
            role: UserRole.team_member,
            districtId: 'd1',
            dsId: 'ds1',
            gnId: 'gn1',
            teamId: 't1',
            tokenVersion: 1,
            isActive: true,
          }),
        },
      } as unknown as PrismaService;

      const strategy = new JwtStrategy(mockConfig, mockPrisma);

      // Attempt to access /v1/accounts with change-password scope
      const req = { url: '/v1/accounts', originalUrl: '/v1/accounts' };
      const payload: JwtPayload = {
        sub: 'u1',
        userCode: 'GRS0000000001',
        role: UserRole.team_member,
        scope: 'change-password',
        tokenVersion: 1,
      };

      await expect(strategy.validate(req, payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('allows scope: change-password token on /v1/auth/change-password endpoint', async () => {
      const mockConfig = {
        get: jest
          .fn()
          .mockImplementation((key) =>
            key === 'JWT_ACCESS_SECRET' ? 'test-secret' : undefined,
          ),
      } as unknown as ConfigService;
      const mockPrisma = {
        profile: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'u1',
            role: UserRole.team_member,
            districtId: 'd1',
            dsId: 'ds1',
            gnId: 'gn1',
            teamId: 't1',
            tokenVersion: 1,
            isActive: true,
          }),
        },
      } as unknown as PrismaService;

      const strategy = new JwtStrategy(mockConfig, mockPrisma);

      const req = {
        url: '/v1/auth/change-password',
        originalUrl: '/v1/auth/change-password',
      };
      const payload: JwtPayload = {
        sub: 'u1',
        userCode: 'GRS0000000001',
        role: UserRole.team_member,
        scope: 'change-password',
        tokenVersion: 1,
      };

      const result = await strategy.validate(req, payload);
      expect(result).toBeDefined();
      expect(result.userId).toBe('u1');
      expect(result.scope).toBe('change-password');
    });
  });

  describe('2. Password Handling & Hyphen Preservation (credential.service.ts & auth.service.ts)', () => {
    let credentialService: CredentialService;

    beforeEach(() => {
      credentialService = new CredentialService();
    });

    it('preserves hyphens in passwords; an 8-dash password does not hash to empty string', async () => {
      const eightDashes = '--------';
      const normalized = credentialService.normalizePassword(eightDashes);
      expect(normalized).toBe('--------');
      expect(normalized.length).toBe(8);

      const hash = await credentialService.hashUserPassword(eightDashes);
      expect(hash).toBeDefined();
      expect(hash.startsWith('$argon2id$')).toBe(true);

      const isValid = await credentialService.verifyPassword(hash, eightDashes);
      expect(isValid).toBe(true);

      // Verify that empty string does NOT verify against this hash
      const emptyMatch = await credentialService.verifyPassword(hash, '');
      expect(emptyMatch).toBe(false);
    });

    it('trims leading and trailing whitespace in normalizePassword but preserves interior dashes', () => {
      expect(
        credentialService.normalizePassword('  my-complex-password-123  '),
      ).toBe('my-complex-password-123');
    });

    it('stripDisplayDashes only affects standard 12-char (XXXX-XXXX-XXXX) generated formats', () => {
      expect(credentialService.stripDisplayDashes('2345-6789-ABCD')).toBe(
        '23456789ABCD',
      );
      // Passwords that are not formatted as XXXX-XXXX-XXXX remain untouched
      expect(credentialService.stripDisplayDashes('--------')).toBe('--------');
      expect(credentialService.stripDisplayDashes('my-custom-pass')).toBe(
        'my-custom-pass',
      );
    });
  });

  describe('3. Territory Scoping for DC and SDA (account.service.ts)', () => {
    let accountService: AccountService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        team: {
          findUnique: jest.fn(),
        },
        gnDivision: {
          findUnique: jest.fn(),
        },
        divisionalSecretariat: {
          findUnique: jest.fn(),
        },
        profile: {
          create: jest.fn(),
          count: jest.fn(),
        },
        accountAudit: {
          create: jest.fn(),
        },
        $transaction: jest.fn((cb) => cb(mockPrisma)),
        $queryRaw: jest.fn(),
      };

      accountService = new AccountService(
        mockPrisma,
        new CredentialService(),
        new ScopeService(),
      );
    });

    it('forbids DC from creating an account with another district ID', async () => {
      const dcScope = {
        userId: 'dc1',
        role: UserRole.dc,
        districtId: 'colombo-dist-id',
      };

      await expect(
        accountService.createAccount(dcScope, {
          fullName: 'Test SDA',
          role: UserRole.sda,
          districtId: 'gampaha-dist-id', // different district
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids DC from creating an account for a team outside their district', async () => {
      const dcScope = {
        userId: 'dc1',
        role: UserRole.dc,
        districtId: 'colombo-dist-id',
      };

      // Mock team in Gampaha district
      mockPrisma.team.findUnique.mockResolvedValue({
        id: 'team-in-gampaha',
        gnId: 'gn-gampaha',
        gn: {
          dsId: 'ds-gampaha',
          ds: {
            districtId: 'gampaha-dist-id',
          },
        },
      });

      await expect(
        accountService.createAccount(dcScope, {
          fullName: 'Test Team Member',
          role: UserRole.team_member,
          teamId: 'team-in-gampaha',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids SDA from creating an account outside their DS division', async () => {
      const sdaScope = {
        userId: 'sda1',
        role: UserRole.sda,
        districtId: 'colombo-dist-id',
        dsId: 'colombo-north-ds',
      };

      await expect(
        accountService.createAccount(sdaScope, {
          fullName: 'Test CDC Secretary',
          role: UserRole.cdc_secretary,
          dsId: 'colombo-south-ds', // different DS
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects mismatched districtId and team with BadRequestException', async () => {
      const adminScope = {
        userId: 'admin1',
        role: UserRole.super_admin,
      };

      mockPrisma.team.findUnique.mockResolvedValue({
        id: 'team-colombo',
        gnId: 'gn-colombo',
        gn: {
          dsId: 'ds-colombo',
          ds: {
            districtId: 'colombo-dist-id',
          },
        },
      });

      await expect(
        accountService.createAccount(adminScope, {
          fullName: 'Test Member',
          role: UserRole.team_member,
          teamId: 'team-colombo',
          districtId: 'kandy-dist-id', // Mismatched district
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('4. Team Member Limit (C8) Bypass Fixes (account.service.ts)', () => {
    let accountService: AccountService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        team: {
          findUnique: jest.fn(),
        },
        profile: {
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          count: jest.fn(),
        },
        accountAudit: {
          create: jest.fn(),
        },
        $transaction: jest.fn((cb) => cb(mockPrisma)),
        $queryRaw: jest.fn(),
      };

      accountService = new AccountService(
        mockPrisma,
        new CredentialService(),
        new ScopeService(),
      );
    });

    it('enforces capacity when CDC secretary omits teamId on createAccount', async () => {
      const cdcScope = {
        userId: 'cdc1',
        role: UserRole.cdc_secretary,
        districtId: 'd1',
        dsId: 'ds1',
        gnId: 'gn1',
        teamId: 'cdc-team-id',
      };

      mockPrisma.team.findUnique.mockResolvedValue({
        id: 'cdc-team-id',
        gnId: 'gn1',
        gn: {
          dsId: 'ds1',
          ds: {
            districtId: 'd1',
          },
        },
      });

      // Mock capacity check query: team has max_members = 5
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'cdc-team-id', max_members: 5, gn_id: 'gn1' },
      ]);
      // Mock active member count: 5 members already active (0 available slots)
      mockPrisma.profile.count.mockResolvedValue(5);

      // CDC Secretary creates member WITHOUT passing teamId in dto
      await expect(
        accountService.createAccount(cdcScope, {
          fullName: 'Sneaky Member',
          role: UserRole.team_member,
          // teamId omitted!
        }),
      ).rejects.toThrow(ConflictException);

      // Verify that $queryRaw was called to check capacity with FOR UPDATE
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it('enforces capacity when reactivating an inactive team member via updateAccount', async () => {
      const adminScope = {
        userId: 'admin1',
        role: UserRole.super_admin,
      };

      // Target is an inactive member of team-1
      mockPrisma.profile.findUnique.mockResolvedValue({
        id: 'target-member-1',
        role: UserRole.team_member,
        teamId: 'team-1',
        isActive: false,
        districtId: 'd1',
        dsId: 'ds1',
        gnId: 'gn1',
        createdBy: 'admin1',
      });

      // Team is at capacity (max 10, current active 10)
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'team-1', max_members: 10, gn_id: 'gn1' },
      ]);
      mockPrisma.profile.count.mockResolvedValue(10);

      // PATCH { isActive: true }
      await expect(
        accountService.updateAccount(adminScope, 'target-member-1', {
          isActive: true,
        }),
      ).rejects.toThrow(ConflictException);

      // Verify capacity was checked inside tx
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });
  });
});
