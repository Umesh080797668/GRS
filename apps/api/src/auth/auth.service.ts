import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialService } from './credential.service';
import { EmailService } from '../email/email.service';
import { RateLimitService } from '../config/rate-limit.service';
import { SessionActivityService } from './session-activity.service';
import { GrsValidators } from '../common/validators/grs-validators';
import { isWebOnlyRole, UserRole } from '../common/scope/scope.types';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SwitchAreaDto } from './dto/switch-area.dto';
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
    @Optional()
    private readonly sessionActivityService?: SessionActivityService,
  ) { }

  private async runActivitySafe(
    action: string,
    fn: (() => Promise<unknown> | undefined) | undefined,
  ): Promise<void> {
    if (!fn) return;
    try {
      await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Session activity ${action} skipped: ${message}`);
    }
  }

  /**
   * Normalizes login identifier (GRS ID -> uppercase, Email -> lowercase).
   */
  normalizeIdentifier(raw: string): { type: 'code' | 'email'; value: string } {
    if (!raw || typeof raw !== 'string') {
      throw new BadRequestException('Identifier must be a string');
    }
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
  async login(
    dto: LoginDto,
    ip: string = '127.0.0.1',
    clientType?: string,
  ): Promise<LoginResult> {
    if (
      !dto ||
      typeof dto.identifier !== 'string' ||
      typeof dto.password !== 'string'
    ) {
      throw new BadRequestException('Invalid credentials payload');
    }
    const cleanIp = (ip || '127.0.0.1').trim();
    const cleanDeviceId =
      typeof dto.deviceId === 'string' ? dto.deviceId.trim() : undefined;
    const deviceSuffix = cleanDeviceId ? `:${cleanDeviceId}` : `:${cleanIp}`;
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

      // 2. Identifier-level rate limit keyed on ID and email plus device/IP per Blueprint §3.1
      if (type === 'email') {
        const rlEmail = await this.rateLimitService.checkRateLimit(
          `login:email:${value}${deviceSuffix}`,
          5,
          60,
        );
        if (rlEmail && !rlEmail.allowed) {
          this.rateLimitService.throwThrottled(rlEmail.retryAfter || 60);
        }
      }
      const rlId = await this.rateLimitService.checkRateLimit(
        `login:id:${value}${deviceSuffix}`,
        5,
        60,
      );
      if (rlId && !rlId.allowed) {
        this.rateLimitService.throwThrottled(rlId.retryAfter || 60);
      }

      // 3. Device-level rate limit per Blueprint §3.1 (max 10 attempts per minute per device)
      if (cleanDeviceId) {
        const rlDevice = await this.rateLimitService.checkRateLimit(
          `login:device:${cleanDeviceId}`,
          10,
          60,
        );
        if (rlDevice && !rlDevice.allowed) {
          this.rateLimitService.throwThrottled(rlDevice.retryAfter || 60);
        }
      }
    }

    const profile = await this.prisma.profile.findFirst({
      where:
        type === 'code'
          ? { userCode: { equals: value } }
          : { email: { equals: value } },
    });

    if (profile && this.rateLimitService?.checkRateLimit) {
      if (type === 'email' && profile.userCode) {
        const rlCode = await this.rateLimitService.checkRateLimit(
          `login:id:${profile.userCode}${deviceSuffix}`,
          5,
          60,
        );
        if (rlCode && !rlCode.allowed) {
          this.rateLimitService.throwThrottled(rlCode.retryAfter || 60);
        }
      } else if (type === 'code' && profile.email) {
        const rlEmail = await this.rateLimitService.checkRateLimit(
          `login:email:${profile.email.toLowerCase()}${deviceSuffix}`,
          5,
          60,
        );
        if (rlEmail && !rlEmail.allowed) {
          this.rateLimitService.throwThrottled(rlEmail.retryAfter || 60);
        }
      }
    }

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
    // Check account lockout - run dummy hash to eliminate timing difference (Invariant 14)
    if (profile.lockedUntil && profile.lockedUntil > now) {
      await this.credentialService.verifyPassword(
        AuthService.DUMMY_HASH,
        dto.password,
      );
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
        // Atomic increment of failed attempts with RETURNING, then decide the lock
        const updated = await this.prisma.profile.update({
          where: { id: profile.id },
          data: {
            failedLoginCount: { increment: 1 },
          },
          select: { failedLoginCount: true },
        });

        if (updated.failedLoginCount >= 5) {
          await this.prisma.profile.update({
            where: { id: profile.id },
            data: {
              lockedUntil: new Date(Date.now() + 15 * 60 * 1000), // 15-minute temporary lockout
            },
          });
        }
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

    this.assertClientChannelAllowed(
      profile.role,
      clientType,
      (dto as any).clientType,
    );

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
    const signedInAt = new Date();
    await this.prisma.profile.update({
      where: { id: profile.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: signedInAt,
        lastActiveAt: signedInAt,
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
    const session = await this.generateAuthSession(profile, dto.deviceId);
    await this.runActivitySafe('recordLoginSession', () =>
      this.sessionActivityService?.recordLoginSession({
        profileId: profile.id,
        clientType,
        deviceId: dto.deviceId,
        now: signedInAt,
      }),
    );
    return session;
  }

  /**
   * Forces password change on first sign-in or user-requested change.
   * Clears must_change_password and increments token_version to kill stale sessions.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    clientType?: string,
    deviceId?: string,
  ): Promise<AuthSession> {
    if (typeof userId !== 'string' || !userId.trim()) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID',
        message_key: 'errors.auth.invalid_user',
      });
    }
    const cleanUserId = userId.trim();
    const profile = await this.prisma.profile.findUnique({
      where: { id: cleanUserId },
    });

    if (!profile || !profile.isActive) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID',
        message_key: 'errors.auth.invalid_user',
      });
    }

    const cleanCurrent = (dto.currentPassword || '').trim();
    const currentValid = await this.credentialService.verifyPassword(
      profile.passwordHash,
      cleanCurrent,
    );

    if (!currentValid) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message_key: 'errors.auth.wrong_current_password',
      });
    }

    // Validate new password rules (Appendix A)
    const cleanNew = (dto.newPassword || '').trim();

    // Reject previous password
    if (cleanNew === cleanCurrent) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message_key: 'errors.auth.password_same_as_previous',
        message: 'New password cannot be the same as previous password',
      });
    }

    // Reject common passwords and enforce length (Appendix A)
    const passwordValidation = GrsValidators.validatePassword(cleanNew);
    if (!passwordValidation.isValid) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message_key:
          passwordValidation.error === 'common_password'
            ? 'errors.auth.password_common'
            : 'errors.auth.password_too_short',
        message:
          passwordValidation.error === 'common_password'
            ? 'Password is too common and easily guessed'
            : 'Password must be at least 8 characters long',
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

    await this.runActivitySafe('endSessionsOnPasswordChange', () =>
      this.sessionActivityService?.endSessions({
        profileId: userId,
        reason: 'password_reset',
        all: true,
      }),
    );

    const session = await this.generateAuthSession(updated, deviceId);
    await this.runActivitySafe('recordLoginSessionAfterPasswordChange', () =>
      this.sessionActivityService?.recordLoginSession({
        profileId: userId,
        clientType,
        deviceId,
      }),
    );
    return session;
  }

  /**
   * Rotates refresh tokens with reuse detection.
   */
  async refreshTokens(
    dto: RefreshTokenDto,
    clientType?: string,
  ): Promise<AuthSession> {
    if (
      !dto ||
      typeof dto.refreshToken !== 'string' ||
      !dto.refreshToken.trim()
    ) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID',
        message_key: 'errors.auth.invalid_refresh_token',
      });
    }
    const tokenHash = crypto
      .createHash('sha256')
      .update(dto.refreshToken.trim())
      .digest('hex');

    const tokenRecord = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: { equals: tokenHash } },
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
    this.assertClientChannelAllowed(profile.role, clientType);

    // Revoke current token and issue new pair (preserve deviceId if not explicitly provided)
    const deviceId = dto.deviceId || tokenRecord.deviceId;

    // Preserve active area assignment on refresh (Decision C20 / Multi-GN architecture)
    let activeAreaOverride:
      | { gnId?: string; teamId?: string; dsId?: string; districtId?: string }
      | undefined = undefined;
    const activeGnId = (tokenRecord as any).activeGnId;
    const activeTeamId = (tokenRecord as any).activeTeamId;
    if (activeGnId) {
      const gn = await this.prisma.gnDivision.findUnique({
        where: { id: activeGnId },
        include: { ds: true },
      });
      if (gn) {
        activeAreaOverride = {
          gnId: gn.id,
          teamId: activeTeamId ?? profile.teamId ?? undefined,
          dsId: gn.dsId,
          districtId: gn.ds?.districtId,
        };
      }
    }

    // Atomically revoke current token first to prevent rotation races and orphan sessions
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

    const session = await this.generateAuthSession(
      profile,
      deviceId ?? undefined,
      activeAreaOverride,
    );

    await this.runActivitySafe('touchActivityOnRefresh', () =>
      this.sessionActivityService?.touchActivity({
        profileId: profile.id,
        clientType,
        deviceId: deviceId ?? undefined,
        skipDebounce: true,
      }),
    );

    return session;
  }

  /**
   * UX / channel guard enforcing web-only vs mobile-only role boundaries.
   * Authoritative API access control is still enforced via `@Roles(...)` and `ScopeService`.
   */
  private assertClientChannelAllowed(
    role: UserRole,
    clientType?: string,
    dtoClientType?: string,
  ): void {
    const isWeb = clientType === 'web' || dtoClientType === 'web';
    const isMobile = clientType === 'mobile' || dtoClientType === 'mobile';

    if (isWeb && role === UserRole.team_member) {
      throw new ForbiddenException({
        code: 'WEB_ACCESS_RESTRICTED',
        message:
          'Team members (Level 5) are restricted to the mobile application and cannot access the web dashboard.',
      });
    }

    if (isMobile && isWebOnlyRole(role)) {
      throw new ForbiddenException({
        code: 'MOBILE_ACCESS_RESTRICTED',
        message_key: 'errors.auth.mobile_restricted',
        message:
          'This administrative role is restricted to the web dashboard and does not have mobile app access.',
      });
    }
  }

  /**
   * Switches active GN division for multi-GN Level 4 CDC secretaries.
   * Reissues access token and refresh token scoped to the selected GN and team.
   */
  async switchArea(
    userId: string,
    dto: SwitchAreaDto,
    clientType?: string,
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
    this.assertClientChannelAllowed(profile.role, clientType);

    // Verify active assignment for this GN division in profile_assignments
    const assignment = await this.prisma.profileAssignment.findFirst({
      where: {
        profileId: userId,
        gnId: dto.gnId,
        validTo: null,
      },
      include: {
        gn: {
          include: {
            ds: true,
          },
        },
        team: true,
      },
    });

    if (!assignment) {
      throw new ForbiddenException({
        code: 'AREA_ASSIGNMENT_NOT_FOUND',
        message: 'You do not hold an active assignment for this GN division',
      });
    }

    const activeArea = {
      gnId: assignment.gnId,
      teamId:
        assignment.teamId || assignment.team?.id || profile.teamId || undefined,
      dsId: assignment.gn.dsId,
      districtId: assignment.gn.ds.districtId,
    };

    // Update active GN on profile so default queries stay in sync
    await this.prisma.profile.update({
      where: { id: userId },
      data: {
        gnId: activeArea.gnId,
        ...(activeArea.teamId ? { teamId: activeArea.teamId } : {}),
      },
    });

    // Audit log area switch
    try {
      await this.prisma.accountAudit.create({
        data: {
          actorId: userId,
          targetId: userId,
          action: 'switch_area',
        },
      });
    } catch { }

    const session = await this.generateAuthSession(
      profile,
      dto.deviceId,
      activeArea,
    );
    await this.runActivitySafe('touchActivityOnSwitchArea', () =>
      this.sessionActivityService?.touchActivity({
        profileId: userId,
        clientType,
        deviceId: dto.deviceId,
        skipDebounce: true,
      }),
    );
    return session;
  }

  /**
   * Returns all actively assigned GN divisions for the given user.
   */
  async getAssignments(userId: string) {
    const assignments = await this.prisma.profileAssignment.findMany({
      where: { profileId: userId, validTo: null },
      include: { gn: true, team: true },
      orderBy: { createdAt: 'asc' },
    });
    return assignments.map((a) => ({
      id: a.id,
      gnId: a.gnId,
      gnName: a.gn?.gnName || a.gn?.gnNumber || '',
      gnNumber: a.gn?.gnNumber || '',
      teamId: a.teamId,
      teamNo: a.team?.teamNo,
    }));
  }

  /**
   * Terminates active session. If deviceId is provided, terminates sessions for that device.
   * If deviceId is omitted, revokes all active refresh tokens for the profile and bumps tokenVersion
   * to immediately invalidate all existing access tokens.
   */
  async logout(profileId: string, deviceId?: string, clientType?: string) {
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
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      // Invalidate active access tokens immediately by incrementing tokenVersion
      await this.prisma.profile.update({
        where: { id: profileId },
        data: { tokenVersion: { increment: 1 } },
      });
    }
    await this.runActivitySafe('endSessionsOnLogout', () =>
      this.sessionActivityService?.endSessions({
        profileId,
        reason: 'logout',
        clientType,
        deviceId,
      }),
    );
    return { success: true };
  }

  /**
   * Records an explicit keep-alive heartbeat from an active web or mobile client.
   */
  async recordHeartbeat(
    profileId: string,
    clientType?: string,
    deviceId?: string,
  ) {
    let lastActiveAt = new Date();
    await this.runActivitySafe('heartbeat', async () => {
      if (this.sessionActivityService) {
        lastActiveAt = await this.sessionActivityService.touchActivity({
          profileId,
          clientType,
          deviceId,
          skipDebounce: true,
        });
      }
    });
    return {
      ok: true,
      lastActiveAt: lastActiveAt.toISOString(),
    };
  }

  /**
   * Generates JWT Access Token (15m) and Refresh Token (30d).
   */
  private async generateAuthSession(
    profile: any,
    deviceId?: string,
    activeArea?: {
      gnId?: string;
      teamId?: string;
      dsId?: string;
      districtId?: string;
    },
  ) {
    const effectiveGnId = activeArea?.gnId ?? profile.gnId;
    const effectiveTeamId = activeArea?.teamId ?? profile.teamId;
    const effectiveDsId = activeArea?.dsId ?? profile.dsId;
    const effectiveDistrictId = activeArea?.districtId ?? profile.districtId;

    const payload = {
      sub: profile.id,
      userCode: profile.userCode,
      role: profile.role,
      districtId: effectiveDistrictId,
      dsId: effectiveDsId,
      gnId: effectiveGnId,
      teamId: effectiveTeamId,
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
        activeGnId: effectiveGnId,
        activeTeamId: effectiveTeamId,
        expiresAt,
      },
    });

    let assignments: any[] = [];
    try {
      assignments = await this.prisma.profileAssignment.findMany({
        where: { profileId: profile.id, validTo: null },
        include: { gn: true, team: true },
        orderBy: { createdAt: 'asc' },
      });
    } catch { }

    const sanitized: any = this.sanitizeProfile({
      ...profile,
      gnId: effectiveGnId,
      teamId: effectiveTeamId,
      dsId: effectiveDsId,
      districtId: effectiveDistrictId,
    });

    sanitized.assignments = assignments.map((a) => ({
      id: a.id,
      gnId: a.gnId,
      gnName: a.gn?.gnName || a.gn?.gnNumber || '',
      gnNumber: a.gn?.gnNumber || '',
      teamId: a.teamId,
      teamNo: a.team?.teamNo,
      isActiveArea: a.gnId === effectiveGnId,
    }));

    return {
      mustChangePassword: false as const,
      accessToken,
      refreshToken: rawRefreshToken,
      user: sanitized,
      profile: sanitized,
    };
  }

  /**
   * Adds a pending email and dispatches a 6-digit verification code (M1.15 / M2.5).
   */
  async addPendingEmail(userId: string, email: string) {
    if (
      !userId ||
      typeof userId !== 'string' ||
      !email ||
      typeof email !== 'string'
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Valid user ID and email address are required',
      });
    }
    const cleanUserId = userId.trim();
    const cleanEmail = email.trim().toLowerCase();
    const existing = await this.prisma.profile.findFirst({
      where: {
        id: { not: cleanUserId },
        OR: [
          { email: { equals: cleanEmail } },
          { pendingEmail: { equals: cleanEmail } },
        ],
      },
    });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_IN_USE',
        message_key: 'errors.auth.email_already_in_use',
        message: 'This email is already associated with another account',
      });
    }

    await this.prisma.profile.update({
      where: { id: cleanUserId },
      data: { pendingEmail: cleanEmail },
    });

    return this.emailService.sendCode(cleanUserId, cleanEmail, 'verify');
  }

  /**
   * Verifies the 6-digit code and promotes pending email to verified primary email (M1.15 / M2.5).
   */
  async verifyEmail(userId: string, code: string) {
    if (
      !userId ||
      typeof userId !== 'string' ||
      !code ||
      typeof code !== 'string'
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '6-digit verification code is required',
      });
    }
    const cleanUserId = userId.trim();
    const cleanCode = code.trim();
    const profile = await this.prisma.profile.findUnique({
      where: { id: cleanUserId },
    });
    if (!profile || !profile.pendingEmail) {
      throw new BadRequestException({
        code: 'NO_PENDING_EMAIL',
        message:
          'No pending email to verify. Please add an email address first.',
      });
    }

    await this.emailService.verifyCode(
      cleanUserId,
      profile.pendingEmail,
      cleanCode,
      'verify',
    );

    const updated = await this.prisma.profile.update({
      where: { id: cleanUserId },
      data: {
        email: profile.pendingEmail,
        pendingEmail: null,
      },
    });

    await this.prisma.accountAudit.create({
      data: {
        actorId: cleanUserId,
        targetId: cleanUserId,
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
      where: { email: { equals: cleanEmail }, isActive: true },
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
    if (
      !email ||
      typeof email !== 'string' ||
      !code ||
      typeof code !== 'string' ||
      !newPassword ||
      typeof newPassword !== 'string'
    ) {
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
      where: { email: { equals: cleanEmail }, isActive: true },
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
    const passwordValidation = GrsValidators.validatePassword(cleanNew);
    if (!passwordValidation.isValid) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message_key:
          passwordValidation.error === 'common_password'
            ? 'errors.auth.password_common'
            : 'errors.auth.password_too_short',
        message:
          passwordValidation.error === 'common_password'
            ? 'Password is too common and easily guessed'
            : 'Password must be at least 8 characters long',
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

        await this.sessionActivityService?.endSessions(
          {
            profileId: profile.id,
            reason: 'password_reset',
            all: true,
          },
          tx,
        );

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
