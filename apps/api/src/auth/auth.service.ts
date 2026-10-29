import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialService } from './credential.service';
import { EmailService } from '../email/email.service';
import { RateLimitService } from '../config/rate-limit.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
export type AuthSession = {
  mustChangePassword: false;
  accessToken: string;
  refreshToken: string;
  user: Record<string, any>;
};

export type LoginResult =
  | {
      mustChangePassword: true;
      accessToken: string;
      user: Record<string, any>;
      profile?: Record<string, any>;
    }
  | AuthSession;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Fallback dummy hash to prevent timing-based user enumeration attacks (Invariant 14)
  private static readonly DUMMY_HASH =
    process.env.NODE_ENV === 'test'
      ? '$argon2id$v=19$m=1024,t=1,p=1$63DNh8tIO+OXs9dMrTXYkw$6XuPraQ129LdwF5c3Dozgo7QxpieGmv1PLOX0BjnyjU'
      : '$argon2id$v=19$m=32768,t=2,p=2$PCH/SUt3YMNC8/qnCRijvA$Cuw1+IShJzEuWjILkokIT2XnzXYW1cUf6qBB64fWLC8';

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialService: CredentialService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  /**
   * Normalizes login identifier (GRS ID -> uppercase, Email -> lowercase).
   */
  normalizeIdentifier(raw: string): { type: 'code' | 'email'; value: string } {
    const trimmed = raw.trim();
    if (trimmed.includes('@')) {
      return { type: 'email', value: trimmed.toLowerCase() };
    }
    if (
      /^GRS\d{10}$/i.test(trimmed) ||
      trimmed.toUpperCase().startsWith('GRS')
    ) {
      return { type: 'code', value: trimmed.toUpperCase() };
    }
    return { type: 'email', value: trimmed.toLowerCase() };
  }

  /**
   * Authenticates user with uniform failure semantics (Invariant 14).
   * Supports GRS ID and verified email addresses.
   */
  async login(dto: LoginDto, ip: string = '127.0.0.1'): Promise<LoginResult> {
    const cleanIp = (ip || '127.0.0.1').trim();
    const { type, value } = this.normalizeIdentifier(dto.identifier);

    if (this.rateLimitService?.checkRateLimit) {
      // 1. IP-level rate limit: max 30 attempts per minute per IP
      const rlIp = await this.rateLimitService.checkRateLimit(
        `login:ip:${cleanIp}`,
        30,
        60,
      );
      if (rlIp && !rlIp.allowed) {
        this.rateLimitService.throwThrottled(rlIp.retryAfter || 60);
      }

      // 2. Identifier-level rate limit: max 5 attempts per minute per identifier
      const rlId = await this.rateLimitService.checkRateLimit(
        `login:id:${value}`,
        5,
        60,
      );
      if (rlId && !rlId.allowed) {
        this.rateLimitService.throwThrottled(rlId.retryAfter || 60);
      }
    }

    const profile = await this.prisma.profile.findFirst({
      where: type === 'code' ? { userCode: value } : { email: value },
    });

    if (!profile) {
      // Execute dummy verify to ensure equal timing without user enumeration
      await this.credentialService.verifyPassword(
        AuthService.DUMMY_HASH,
        dto.password,
      );
      throw new UnauthorizedException({
        code: 'AUTH_INVALID',
        message_key: 'errors.auth.invalid_credentials',
      });
    }

    const now = new Date();
    // Check account lockout
    if (profile.lockedUntil && profile.lockedUntil > now) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID',
        message_key: 'errors.auth.invalid_credentials',
      });
    }

    const isLockExpired = Boolean(
      profile.lockedUntil && profile.lockedUntil <= now,
    );

    // Verify password (trimmed consistently with changePassword)
    const cleanPassword = dto.password.trim();
    const isPasswordValid = await this.credentialService.verifyPassword(
      profile.passwordHash,
      cleanPassword,
    );

    if (!isPasswordValid) {
      if (isLockExpired) {
        // Lock has expired; reset fail count to 1 and clear lock
        await this.prisma.profile.update({
          where: { id: profile.id },
          data: {
            failedLoginCount: 1,
            lockedUntil: null,
          },
        });
      } else {
        // Atomic increment of failed attempts in DB
        const nextFailCount = profile.failedLoginCount + 1;
        const lockedUntil =
          nextFailCount >= 5
            ? new Date(Date.now() + 15 * 60 * 1000) // 15-minute temporary lockout
            : null;

        await this.prisma.profile.update({
          where: { id: profile.id },
          data: {
            failedLoginCount: { increment: 1 },
            lockedUntil,
          },
        });
      }

      throw new UnauthorizedException({
        code: 'AUTH_INVALID',
        message_key: 'errors.auth.invalid_credentials',
      });
    }

    // Check account active state
    if (!profile.isActive) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_DEACTIVATED',
        message_key: 'errors.auth.deactivated',
      });
    }

    // Check initial password expiry (Decision C14)
    if (
      profile.mustChangePassword &&
      profile.passwordExpiresAt &&
      profile.passwordExpiresAt < new Date()
    ) {
      throw new UnauthorizedException({
        code: 'PASSWORD_EXPIRED',
        message_key: 'errors.auth.initial_password_expired',
      });
    }

    // Reset failed counter and record last login
    await this.prisma.profile.update({
      where: { id: profile.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    // Handle First-Sign-in Scope Restriction
    if (profile.mustChangePassword) {
      const limitedToken = this.jwtService.sign(
        {
          sub: profile.id,
          role: profile.role,
          scope: 'change-password',
          tokenVersion: profile.tokenVersion,
        },
        { expiresIn: '15m' } as any,
      );

      return {
        mustChangePassword: true as const,
        accessToken: limitedToken,
        user: this.sanitizeProfile(profile),
        profile: this.sanitizeProfile(profile),
      };
    }

    // Standard Login Session
    return this.generateAuthSession(profile, dto.deviceId);
  }

  /**
   * Forces password change on first sign-in or user-requested change.
   * Clears must_change_password and increments token_version to kill stale sessions.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<AuthSession> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: userId },
    });

    if (!profile || !profile.isActive) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID',
        message_key: 'errors.auth.invalid_user',
      });
    }

    const currentValid = await this.credentialService.verifyPassword(
      profile.passwordHash,
      dto.currentPassword,
    );

    if (!currentValid) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message_key: 'errors.auth.wrong_current_password',
      });
    }

    // Validate new password rules (Appendix A)
    const cleanNew = dto.newPassword.trim();
    if (cleanNew.length < 8) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message_key: 'errors.auth.password_too_short',
      });
    }
    if (
      cleanNew === profile.userCode ||
      (profile.email && cleanNew === profile.email)
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message_key: 'errors.auth.password_same_as_id',
      });
    }

    const newHash = await this.credentialService.hashUserPassword(cleanNew);

    const updated = await this.prisma.profile.update({
      where: { id: userId },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
        passwordExpiresAt: null,
        passwordChangedAt: new Date(),
        tokenVersion: profile.tokenVersion + 1,
      },
    });

    // Revoke all existing refresh tokens
    await this.prisma.refreshToken.updateMany({
      where: { profileId: userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return this.generateAuthSession(updated);
  }

  /**
   * Rotates refresh tokens with reuse detection.
   */
  async refreshTokens(dto: RefreshTokenDto): Promise<AuthSession> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(dto.refreshToken)
      .digest('hex');

    const tokenRecord = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: { profile: true },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID',
        message_key: 'errors.auth.invalid_refresh_token',
      });
    }

    // Detect token reuse
    if (
      tokenRecord.revokedAt ||
      (tokenRecord.replacedBy && tokenRecord.replacedBy.length > 0)
    ) {
      const gracePeriodMs = 15 * 1000;
      const isWithinGraceWindow =
        tokenRecord.revokedAt &&
        Date.now() - tokenRecord.revokedAt.getTime() < gracePeriodMs;

      if (isWithinGraceWindow) {
        // Concurrent refresh race within grace window: reject this request without revoking all sessions
        throw new UnauthorizedException({
          code: 'AUTH_INVALID',
          message_key: 'errors.auth.refresh_token_revoked',
        });
      }

      // Security Incident: Revoke all refresh tokens for this user!
      await this.prisma.refreshToken.updateMany({
        where: { profileId: tokenRecord.profileId },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({
        code: 'AUTH_INVALID',
        message_key: 'errors.auth.token_reuse_detected',
      });
    }

    // Check expiration
    if (tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID',
        message_key: 'errors.auth.refresh_token_expired',
      });
    }

    const profile = tokenRecord.profile;
    if (!profile.isActive) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_DEACTIVATED',
        message_key: 'errors.auth.deactivated',
      });
    }

    // Revoke current token and issue new pair (preserve deviceId if not explicitly provided)
    const deviceId = dto.deviceId || tokenRecord.deviceId;
    const session = await this.generateAuthSession(
      profile,
      deviceId ?? undefined,
    );

    // Atomically revoke current token to prevent rotation races
    const revokeResult = await this.prisma.refreshToken.updateMany({
      where: { id: tokenRecord.id, revokedAt: null },
      data: {
        revokedAt: new Date(),
      },
    });

    if (revokeResult.count === 0) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID',
        message_key: 'errors.auth.refresh_token_revoked',
      });
    }

    return session;
  }

  /**
   * Terminates active session. If deviceId is omitted, only terminates unassigned sessions
   * rather than revoking all active devices.
   */
  async logout(profileId: string, deviceId?: string) {
    if (deviceId) {
      await this.prisma.refreshToken.updateMany({
        where: {
          profileId,
          deviceId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: {
          profileId,
          deviceId: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }
    return { success: true };
  }

  /**
   * Generates JWT Access Token (15m) and Refresh Token (30d).
   */
  private async generateAuthSession(profile: any, deviceId?: string) {
    const payload = {
      sub: profile.id,
      userCode: profile.userCode,
      role: profile.role,
      districtId: profile.districtId,
      dsId: profile.dsId,
      gnId: profile.gnId,
      teamId: profile.teamId,
      tokenVersion: profile.tokenVersion,
      scope: 'full',
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
    } as any);
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshHash = crypto
      .createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.prisma.refreshToken.create({
      data: {
        profileId: profile.id,
        tokenHash: refreshHash,
        deviceId,
        expiresAt,
      },
    });

    return {
      mustChangePassword: false as const,
      accessToken,
      refreshToken: rawRefreshToken,
      user: this.sanitizeProfile(profile),
      profile: this.sanitizeProfile(profile),
    };
  }

  /**
   * Adds a pending email and dispatches a 6-digit verification code (M1.15 / M2.5).
   */
  async addPendingEmail(userId: string, email: string) {
    if (!email || typeof email !== 'string') {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Valid email address is required',
      });
    }
    const cleanEmail = email.trim().toLowerCase();
    const existing = await this.prisma.profile.findFirst({
      where: { email: cleanEmail, id: { not: userId } },
    });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_IN_USE',
        message: 'This email is already associated with another account',
      });
    }

    await this.prisma.profile.update({
      where: { id: userId },
      data: { pendingEmail: cleanEmail },
    });

    return this.emailService.sendCode(userId, cleanEmail, 'verify');
  }

  /**
   * Verifies the 6-digit code and promotes pending email to verified primary email (M1.15 / M2.5).
   */
  async verifyEmail(userId: string, code: string) {
    if (!code || typeof code !== 'string') {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '6-digit verification code is required',
      });
    }
    const cleanCode = code.trim();
    const profile = await this.prisma.profile.findUnique({
      where: { id: userId },
    });
    if (!profile || !profile.pendingEmail) {
      throw new BadRequestException({
        code: 'NO_PENDING_EMAIL',
        message:
          'No pending email to verify. Please add an email address first.',
      });
    }

    await this.emailService.verifyCode(
      userId,
      profile.pendingEmail,
      cleanCode,
      'verify',
    );

    const updated = await this.prisma.profile.update({
      where: { id: userId },
      data: {
        email: profile.pendingEmail,
        pendingEmail: null,
      },
    });

    await this.prisma.accountAudit.create({
      data: {
        actorId: userId,
        targetId: userId,
        action: 'email_added',
      },
    });

    return {
      message: 'Email successfully verified and linked',
      email: updated.email,
    };
  }

  /**
   * Requests a password reset code. Employs uniform response semantics to prevent email enumeration (Invariant 14).
   */
  async forgotPassword(email: string, clientIp?: string) {
    if (!email || typeof email !== 'string') {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Email address is required',
      });
    }
    const cleanEmail = email.trim().toLowerCase();
    const rateLimitKey = `auth_forgot_${clientIp || 'global'}_${cleanEmail}`;
    const rl = await this.rateLimitService.checkRateLimit(rateLimitKey, 5, 300);
    if (!rl.allowed) {
      this.rateLimitService.throwThrottled(rl.retryAfter || 60);
    }

    const profile = await this.prisma.profile.findFirst({
      where: { email: cleanEmail, isActive: true },
    });

    if (profile) {
      try {
        await this.emailService.sendCode(profile.id, cleanEmail, 'reset');
      } catch (err: any) {
        this.logger.warn(
          `Password reset code skipped for profile ${profile.id}: ${err.message}`,
        );
      }
    } else {
      // Equal work defense: dummy DB query + random number generation to match timing of existing email path
      if (this.prisma.emailCode?.findFirst) {
        await this.prisma.emailCode.findFirst({
          where: { profileId: '00000000-0000-0000-0000-000000000000' },
        });
      }
      crypto.randomInt(100000, 1000000);
    }

    return {
      message:
        'If an account exists with this email, a verification code has been sent.',
    };
  }

  /**
   * Resets password using verified 6-digit email code.
   */
  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
    clientIp?: string,
  ) {
    if (!email || !code || !newPassword) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message_key: 'errors.validation.missing_fields',
      });
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();
    const rateLimitKey = `auth_reset_${clientIp || 'global'}_${cleanEmail}`;
    const rl = await this.rateLimitService.checkRateLimit(
      rateLimitKey,
      10,
      300,
    );
    if (!rl.allowed) {
      this.rateLimitService.throwThrottled(rl.retryAfter || 60);
    }

    const profile = await this.prisma.profile.findFirst({
      where: { email: cleanEmail, isActive: true },
    });

    if (!profile) {
      // Balance timing
      await new Promise((resolve) => setTimeout(resolve, 50));
      throw new UnauthorizedException({
        code: 'INVALID_CODE',
        message_key: 'errors.auth.invalid_reset_code',
        message: 'Invalid email or verification code',
      });
    }

    // Verify 6-digit code with uniform error response
    try {
      await this.emailService.verifyCode(
        profile.id,
        cleanEmail,
        cleanCode,
        'reset',
      );
    } catch (err: any) {
      if (err instanceof UnauthorizedException) {
        throw new UnauthorizedException({
          code: 'INVALID_CODE',
          message_key: 'errors.auth.invalid_reset_code',
          message: 'Invalid email or verification code',
        });
      }
      throw err;
    }

    // Validate new password rules (Appendix A)
    const cleanNew = newPassword.trim();
    if (cleanNew.length < 8) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message_key: 'errors.auth.password_too_short',
      });
    }
    if (
      cleanNew === profile.userCode ||
      (profile.email && cleanNew.toLowerCase() === profile.email.toLowerCase())
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message_key: 'errors.auth.password_same_as_id',
      });
    }

    // Hash new password using user parameter set (Spike S2)
    const newPasswordHash =
      await this.credentialService.hashUserPassword(cleanNew);

    await this.prisma.$transaction(
      async (tx) => {
        await tx.profile.update({
          where: { id: profile.id },
          data: {
            passwordHash: newPasswordHash,
            mustChangePassword: false,
            passwordChangedAt: new Date(),
            failedLoginCount: 0,
            lockedUntil: null,
            tokenVersion: { increment: 1 },
          },
        });

        // Revoke all existing sessions
        await tx.refreshToken.updateMany({
          where: { profileId: profile.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        await tx.accountAudit.create({
          data: {
            actorId: profile.id,
            targetId: profile.id,
            action: 'password_reset',
          },
        });
      },
      { timeout: 25000 },
    );

    return {
      message:
        'Password has been successfully reset. Please log in with your new password.',
    };
  }

  async updateProfile(userId: string, dto: { preferredLanguage?: string }) {
    if (
      dto.preferredLanguage &&
      !['en', 'si', 'ta'].includes(dto.preferredLanguage)
    ) {
      throw new BadRequestException({
        code: 'INVALID_LANGUAGE',
        message_key: 'errors.validation.invalid_language',
      });
    }

    const updated = await this.prisma.profile.update({
      where: { id: userId },
      data: {
        ...(dto.preferredLanguage
          ? { preferredLanguage: dto.preferredLanguage }
          : {}),
      },
    });

    return this.sanitizeProfile(updated);
  }

  private sanitizeProfile(profile: any) {
    const {
      passwordHash,
      failedLoginCount,
      lockedUntil,
      tokenVersion,
      pendingEmail,
      passwordExpiresAt,
      passwordChangedAt,
      ...safe
    } = profile;
    return safe;
  }
}
