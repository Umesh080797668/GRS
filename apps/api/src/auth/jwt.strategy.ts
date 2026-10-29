import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeContext } from '../common/scope/scope.types';

export interface JwtPayload {
  sub: string;
  userCode: string;
  role: string;
  districtId?: string;
  dsId?: string;
  gnId?: string;
  teamId?: string;
  tokenVersion: number;
  scope?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret || secret.trim().length === 0) {
      throw new Error(
        'CRITICAL SECURITY ERROR: JWT_ACCESS_SECRET is not configured in environment variables. Application will not start without a secure JWT secret.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      passReqToCallback: true,
    });
  }

  /**
   * Validates payload and verifies profile active state on EVERY request (Invariant 3 & 4).
   * Enforces restricted scope boundaries (e.g. change-password only tokens).
   * Immediately rejects deactivated accounts or stale token_version.
   */
  async validate(
    reqOrPayload: any,
    maybePayload?: JwtPayload,
  ): Promise<ScopeContext> {
    const req = maybePayload ? reqOrPayload : undefined;
    const payload: JwtPayload = maybePayload || reqOrPayload;

    // Restricted scope check: tokens issued for password change cannot access other endpoints
    if (payload.scope === 'change-password') {
      const url = req ? req.originalUrl || req.path || req.url || '' : '';
      const isChangePassword =
        url.includes('/auth/change-password') ||
        url.endsWith('/change-password');
      if (!isChangePassword) {
        throw new UnauthorizedException({
          code: 'SCOPE_RESTRICTED',
          message_key: 'errors.auth.password_change_required',
          message: 'Token is restricted to password change endpoint only',
        });
      }
    }

    const profile = await this.prisma.profile.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        isActive: true,
        tokenVersion: true,
        districtId: true,
        dsId: true,
        gnId: true,
        teamId: true,
      },
    });

    if (!profile || !profile.isActive) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_DEACTIVATED',
        message_key: 'errors.auth.deactivated',
      });
    }

    if (profile.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID',
        message_key: 'errors.auth.session_revoked',
      });
    }

    return {
      userId: profile.id,
      role: profile.role,
      districtId: profile.districtId,
      dsId: profile.dsId,
      gnId: profile.gnId,
      teamId: profile.teamId,
      scope: payload.scope,
    };
  }
}
