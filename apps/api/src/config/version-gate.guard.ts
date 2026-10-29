import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AppConfigService } from './app-config.service';

@Injectable()
export class VersionGateGuard implements CanActivate {
  constructor(private readonly configService: AppConfigService) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const path: string = request.path || request.url || '';

    // Exempt endpoints: /health, /v1/config, /v1/releases/latest, and root
    if (
      path === '/' ||
      path === '/health' ||
      path.startsWith('/v1/config') ||
      path.startsWith('/v1/releases')
    ) {
      return true;
    }

    const clientVersion =
      request.headers['x-app-version'] || request.query?.app_version;

    const config = await this.configService.getConfig();

    if (!clientVersion || typeof clientVersion !== 'string') {
      throw new HttpException(
        {
          statusCode: 426,
          error: 'UPGRADE_REQUIRED',
          code: 'UPGRADE_REQUIRED',
          message_key: 'error.upgrade_required',
          message:
            'App version header (X-App-Version) is required to access this service.',
          clientVersion: null,
          minSupportedVersion: config.minSupportedVersion,
          apkDownloadUrl: config.apkDownloadUrl,
          details: { min_version: config.minSupportedVersion },
        },
        426, // HTTP 426 Upgrade Required
      );
    }

    const comparison = this.configService.compareSemver(
      clientVersion,
      config.minSupportedVersion,
    );

    if (comparison < 0) {
      throw new HttpException(
        {
          statusCode: 426,
          error: 'UPGRADE_REQUIRED',
          code: 'UPGRADE_REQUIRED',
          message_key: 'error.upgrade_required',
          message:
            'Your app version is no longer supported. Please update to continue.',
          clientVersion,
          minSupportedVersion: config.minSupportedVersion,
          apkDownloadUrl: config.apkDownloadUrl,
          details: { min_version: config.minSupportedVersion },
        },
        426, // HTTP 426 Upgrade Required
      );
    }

    return true;
  }
}
