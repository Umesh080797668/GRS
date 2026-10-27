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

    if (!clientVersion || typeof clientVersion !== 'string') {
      // If no version header is provided (e.g. web browser or admin API call), allow
      return true;
    }

    const config = await this.configService.getConfig();
    const comparison = this.configService.compareSemver(
      clientVersion,
      config.minSupportedVersion,
    );

    if (comparison < 0) {
      throw new HttpException(
        {
          statusCode: 426,
          error: 'UPGRADE_REQUIRED',
          message:
            'Your app version is no longer supported. Please update to continue.',
          clientVersion,
          minSupportedVersion: config.minSupportedVersion,
          apkDownloadUrl: config.apkDownloadUrl,
        },
        426, // HTTP 426 Upgrade Required
      );
    }

    return true;
  }
}
