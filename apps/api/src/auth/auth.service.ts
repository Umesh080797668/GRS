import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialService } from './credential.service';
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
  }
  | AuthSession;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Fallback dummy hash to prevent timing-based user enumeration attacks (Invariant 14)
  private static readonly DUMMY_HASH =
    '$argon2id$v=19$m=32768,t=2,p=2$dGVzdHNhbHQxMjM$DummyHashToPreventTimingAttacks123';

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialService: CredentialService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * Normalizes login identifier (GRS ID -> uppercase, Email -> lowercase).
   */
  normalizeIdentifier(raw: string): { type: 'code' | 'email'; value: string } {
    const trimmed = raw.trim();
    if (trimmed.toUpperCase().startsWith('GRS')) {
      return { type: 'code', value: trimmed.toUpperCase() };
    }
    return { type: 'email', value: trimmed.toLowerCase() };
  }

  /**
   * Authenticates user with uniform failure semantics (Invariant 14).
   * Supports GRS ID and verified email addresses.
   */
  async login(dto: LoginDto): Promise<LoginResult> {
    const { type, value } = this.normalizeIdentifier(dto.identifier);

    const profile = await this.prisma.profile.findFirst({
      where: type === 'code' ? { userCode: value } : { email: value },
    });

    if (!profile) {
      // Execute dummy verify to ensure equal timing without user enumeration
      await this.credentialService.verifyPassword(AuthService.DUMMY_HASH, dto.password);
      throw new UnauthorizedException({
        code: 'AUTH_INVALID',
        message_key: 'errors.auth.invalid_credentials',
      });
    }

    // Check account lockout
    if (profile.lockedUntil && profile.lockedUntil > new Date()) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID',
        message_key: 'errors.auth.account_locked',
      });
    }

    // Verify password
    const isPasswordValid = await this.credentialService.verifyPassword(
      profile.passwordHash,
      dto.password,
    );

    if (!isPasswordValid) {
      const nextFailCount = profile.failedLoginCount + 1;
      const lockedUntil =
        nextFailCount >= 5
          ? new Date(Date.now() + 15 * 60 * 1000) // 15-minute temporary lockout
          : null;

      await this.prisma.profile.update({
        where: { id: profile.id },
        data: {
          failedLoginCount: nextFailCount,
          lockedUntil,
        },
      });

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
        { expiresIn: '15m' },
      );

      return {
        mustChangePassword: true as const,
        accessToken: limitedToken,
        user: this.sanitizeProfile(profile),
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
    if (cleanNew === profile.userCode || (profile.email && cleanNew === profile.email)) {
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
    const tokenHash = crypto.createHash('sha256').update(dto.refreshToken).digest('hex');

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
    if (tokenRecord.revokedAt || (tokenRecord.replacedBy && tokenRecord.replacedBy.length > 0)) {
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

    // Revoke current token and issue new pair
    const session = await this.generateAuthSession(profile, dto.deviceId);

    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: {
        revokedAt: new Date(),
      },
    });

    return session;
  }

  /**
   * Terminates active session.
   */
  async logout(profileId: string, deviceId?: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        profileId,
        deviceId: deviceId || undefined,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
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

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

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
    };
  }

  private sanitizeProfile(profile: any) {
    const { passwordHash, failedLoginCount, lockedUntil, ...safe } = profile;
    return safe;
  }
}
