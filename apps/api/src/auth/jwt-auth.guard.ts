import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    @Optional()
    private readonly appConfigService?: AppConfigService,
  ) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const parentCanActivate = await super.canActivate(context);
    if (!parentCanActivate) {
      return false;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    // super_admin is never locked
    if (!user || user.role === 'super_admin') {
      return true;
    }

    // Exempt endpoints: logout, config, releases
    const rawUrl = req.originalUrl || req.path || req.url || '';
    const path = String(rawUrl).split(/[?#]/)[0].replace(/\/+$/, '');
    if (
      path.endsWith('/v1/auth/logout') ||
      path.includes('/v1/config') ||
      path.includes('/v1/releases')
    ) {
      return true;
    }

    if (this.appConfigService) {
      const lockStatus = await this.appConfigService.getPlatformLockStatus({
        gnId: user.gnId ?? undefined,
        dsId: user.dsId ?? undefined,
        districtId: user.districtId ?? undefined,
        role: user.role,
      });

      if (lockStatus.locked) {
        throw new HttpException(
          {
            statusCode: HttpStatus.LOCKED,
            code: 'PLATFORM_LOCKED',
            message_key: 'errors.auth.platform_locked',
            message: 'Platform or division is locked by administrator',
            reason: lockStatus.reason,
          },
          HttpStatus.LOCKED,
        );
      }
    }

    return true;
  }
}
