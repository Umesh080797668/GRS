import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { CredentialService } from './credential.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/scope/scope.types';
import { EmailService } from '../email/email.service';
import { RateLimitService } from '../config/rate-limit.service';

describe('AuthService (Task M1.3 & Invariant 14)', () => {
  let service: AuthService;
  let prisma: any;
  let credentialService: CredentialService;
  let jwtService: JwtService;
  let emailService: EmailService;

  const mockProfile = {
    id: 'user-uuid-1',
    userCode: 'GRS1234567890',
    email: 'agent@grs.gov.lk',
    passwordHash: '$argon2id$mockHash',
    mustChangePassword: false,
    passwordExpiresAt: null,
    role: UserRole.team_member,
    isActive: true,
    tokenVersion: 1,
    failedLoginCount: 0,
    lockedUntil: null,
    districtId: 'dist-1',
    dsId: 'ds-1',
    gnId: 'gn-1',
    teamId: 'team-1',
  };

  beforeEach(async () => {
    prisma = {
      profile: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest
          .fn()
          .mockImplementation(({ data }) => ({ ...mockProfile, ...data })),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt-1' }),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'rt-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        CredentialService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock.jwt.token'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('mock_jwt_secret'),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendCode: jest
              .fn()
              .mockResolvedValue({ message: 'Verification code sent' }),
            verifyCode: jest.fn().mockResolvedValue(true),
            sendOtp: jest.fn().mockResolvedValue(true),
            sendPasswordReset: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: RateLimitService,
          useValue: {
            checkRateLimit: jest
              .fn()
              .mockResolvedValue({ allowed: true, limit: 10, remaining: 9 }),
            throwThrottled: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    credentialService = module.get<CredentialService>(CredentialService);
    jwtService = module.get<JwtService>(JwtService);
    emailService = module.get<EmailService>(EmailService);
  });

  describe('Identifier Normalization', () => {
    it('normalizes GRS user code to uppercase and email to lowercase', () => {
      expect(service.normalizeIdentifier('grs1234567890')).toEqual({
        type: 'code',
        value: 'GRS1234567890',
      });
      expect(service.normalizeIdentifier('  Agent@GRS.Gov.LK  ')).toEqual({
        type: 'email',
        value: 'agent@grs.gov.lk',
      });
    });

    it('correctly classifies emails starting with grs', () => {
      expect(service.normalizeIdentifier('grsmith@example.com')).toEqual({
        type: 'email',
        value: 'grsmith@example.com',
      });
      expect(service.normalizeIdentifier('GRS_user@domain.lk')).toEqual({
        type: 'email',
        value: 'grs_user@domain.lk',
      });
    });
  });

  describe('Login & Non-Enumeration (Invariant 14)', () => {
    it('throws uniform AUTH_INVALID when user does not exist', async () => {
      prisma.profile.findFirst.mockResolvedValue(null);
      jest.spyOn(credentialService, 'verifyPassword').mockResolvedValue(false);

      await expect(
        service.login({
          identifier: 'GRS9999999999',
          password: 'wrongPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws uniform AUTH_INVALID when password is wrong and tracks failed count', async () => {
      prisma.profile.findFirst.mockResolvedValue({
        ...mockProfile,
        failedLoginCount: 2,
      });
      jest.spyOn(credentialService, 'verifyPassword').mockResolvedValue(false);

      await expect(
        service.login({
          identifier: 'GRS1234567890',
          password: 'wrongPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.profile.update).toHaveBeenCalledWith({
        where: { id: mockProfile.id },
        data: expect.objectContaining({ failedLoginCount: { increment: 1 } }),
      });
    });

    it('locks account for 15 minutes after 5 consecutive failed attempts', async () => {
      prisma.profile.findFirst.mockResolvedValue({
        ...mockProfile,
        failedLoginCount: 4,
      });
      jest.spyOn(credentialService, 'verifyPassword').mockResolvedValue(false);

      await expect(
        service.login({
          identifier: 'GRS1234567890',
          password: 'wrongPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.profile.update).toHaveBeenCalledWith({
        where: { id: mockProfile.id },
        data: expect.objectContaining({
          failedLoginCount: { increment: 1 },
          lockedUntil: expect.any(Date),
        }),
      });
    });

    it('rejects deactivated user with ACCOUNT_DEACTIVATED', async () => {
      prisma.profile.findFirst.mockResolvedValue({
        ...mockProfile,
        isActive: false,
      });
      jest.spyOn(credentialService, 'verifyPassword').mockResolvedValue(true);

      await expect(
        service.login({
          identifier: 'GRS1234567890',
          password: 'correctPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('forces password change and scope-limited token on first login', async () => {
      prisma.profile.findFirst.mockResolvedValue({
        ...mockProfile,
        mustChangePassword: true,
      });
      jest.spyOn(credentialService, 'verifyPassword').mockResolvedValue(true);

      const result = await service.login({
        identifier: 'GRS1234567890',
        password: 'initialPassword',
      });

      expect(result.mustChangePassword).toBe(true);
      expect(result.accessToken).toBe('mock.jwt.token');
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'change-password' }),
        expect.any(Object),
      );
    });

    it('issues full session and refresh token on normal login', async () => {
      prisma.profile.findFirst.mockResolvedValue(mockProfile);
      jest.spyOn(credentialService, 'verifyPassword').mockResolvedValue(true);

      const result = await service.login({
        identifier: 'GRS1234567890',
        password: 'correctPassword',
      });

      expect(result.mustChangePassword).toBe(false);
      if (result.mustChangePassword) {
        throw new Error('Expected mustChangePassword to be false');
      }
      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.refreshToken).toBeDefined();
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });
  });

  describe('Change Password Flow', () => {
    it('rejects new password if shorter than 8 characters', async () => {
      prisma.profile.findUnique.mockResolvedValue(mockProfile);
      jest.spyOn(credentialService, 'verifyPassword').mockResolvedValue(true);

      await expect(
        service.changePassword('user-uuid-1', {
          currentPassword: 'oldPassword',
          newPassword: 'short',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects new password equal to GRS user code', async () => {
      prisma.profile.findUnique.mockResolvedValue(mockProfile);
      jest.spyOn(credentialService, 'verifyPassword').mockResolvedValue(true);

      await expect(
        service.changePassword('user-uuid-1', {
          currentPassword: 'oldPassword',
          newPassword: mockProfile.userCode,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully changes password, bumps tokenVersion and revokes old refresh tokens', async () => {
      prisma.profile.findUnique.mockResolvedValue(mockProfile);
      jest.spyOn(credentialService, 'verifyPassword').mockResolvedValue(true);
      jest
        .spyOn(credentialService, 'hashUserPassword')
        .mockResolvedValue('$argon2id$newHash');

      const result = await service.changePassword('user-uuid-1', {
        currentPassword: 'initialPassword',
        newPassword: 'BrandNewSecurePassword123!',
      });

      expect(prisma.profile.update).toHaveBeenCalledWith({
        where: { id: mockProfile.id },
        data: expect.objectContaining({
          mustChangePassword: false,
          tokenVersion: 2,
        }),
      });

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { profileId: mockProfile.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });

      expect(result.mustChangePassword).toBe(false);
      expect(result.accessToken).toBe('mock.jwt.token');
    });
  });

  describe('Refresh Token Rotation & Reuse Detection', () => {
    it('detects token reuse and revokes all user sessions when reused after grace window', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt-old',
        profileId: mockProfile.id,
        revokedAt: new Date(Date.now() - 30 * 1000), // Revoked 30 seconds ago (outside grace window)
        profile: mockProfile,
      });

      await expect(
        service.refreshTokens({ refreshToken: 'stolenOrReusedToken' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { profileId: mockProfile.id },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rejects without revoking all user sessions when refreshed within grace window', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt-old',
        profileId: mockProfile.id,
        revokedAt: new Date(Date.now() - 2000), // Revoked 2 seconds ago (within 15s grace)
        profile: mockProfile,
      });

      await expect(
        service.refreshTokens({ refreshToken: 'concurrentToken' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('Forgot & Reset Password Non-Enumeration (Invariant 14)', () => {
    it('forgotPassword does not leak whether account exists or is on cooldown', async () => {
      // Non-existent profile
      prisma.profile.findFirst.mockResolvedValue(null);
      const resNonExistent = await service.forgotPassword(
        'nonexistent@example.com',
      );
      expect(resNonExistent.message).toContain('If an account exists');

      // Real profile that hits cooldown in emailService
      prisma.profile.findFirst.mockResolvedValue(mockProfile);
      jest.spyOn(emailService, 'sendCode').mockRejectedValue({
        response: { code: 'EMAIL_COOLDOWN' },
        message: 'Please wait',
      });
      const resCooldown = await service.forgotPassword('real@example.com');
      expect(resCooldown.message).toContain('If an account exists');
    });

    it('resetPassword returns identical INVALID_CODE error for non-existent account and wrong code', async () => {
      // Non-existent profile
      prisma.profile.findFirst.mockResolvedValue(null);
      await expect(
        service.resetPassword(
          'unknown@example.com',
          '123456',
          'NewPassword123!',
        ),
      ).rejects.toMatchObject({
        response: {
          code: 'INVALID_CODE',
        },
      });

      // Existing profile, invalid code
      prisma.profile.findFirst.mockResolvedValue(mockProfile);
      jest.spyOn(emailService, 'verifyCode').mockRejectedValue(
        new UnauthorizedException({
          code: 'INVALID_CODE',
          message: 'Incorrect verification code',
        }),
      );
      await expect(
        service.resetPassword('user@grs.gov.lk', '000000', 'NewPassword123!'),
      ).rejects.toMatchObject({
        response: {
          code: 'INVALID_CODE',
        },
      });
    });
  });
});
