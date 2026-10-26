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
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_ACCESS_SECRET') ||
        'fallback-secret-for-tests-only-must-be-configured-in-env',
    });
  }

  /**
   * Validates payload and verifies profile active state on EVERY request (Invariant 3 & 4).
   * Immediately rejects deactivated accounts or stale token_version.
   */
  async validate(payload: JwtPayload): Promise<ScopeContext> {
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
    };
  }
}
