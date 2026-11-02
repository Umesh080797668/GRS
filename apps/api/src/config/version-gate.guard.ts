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
  constructor(private readonly configService: AppConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const path: string = request.path || request.url || '';

    // Exempt endpoints: /health, /v1/config, /v1/releases, Swagger/OpenAPI docs, and root
    const headers = request.headers || {};
    const clientVersion =
      headers['x-app-version'] || request.query?.app_version;

    // Check if authenticated caller is a mobile field user (team_member or cdc_secretary)
    let isMobileCaller = false;
    const authHeader = headers['authorization'];
    if (
      authHeader &&
      typeof authHeader === 'string' &&
      authHeader.startsWith('Bearer ')
    ) {
      try {
        const tokenParts = authHeader.substring(7).trim().split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(tokenParts[1], 'base64').toString('utf8'),
          );
          if (
            payload?.role === 'team_member' ||
            payload?.role === 'cdc_secretary'
          ) {
            isMobileCaller = true;
          }
        }
      } catch {
        // Ignore parsing errors; invalid tokens will be rejected by JwtAuthGuard
      }
    }

    const isSyncEndpoint = path.startsWith('/v1/sync');

    // Only allow web client exemption if:
    // 1. Explicitly declares x-client-type === 'web'
    // 2. Caller is NOT a field mobile agent (team_member or cdc_secretary)
    // 3. Endpoint is NOT a mobile sync feed (/v1/sync)
    // 4. No clientVersion was provided (if clientVersion was sent, it must always be validated)
    const isExemptWebClient =
      headers['x-client-type'] === 'web' &&
      !isMobileCaller &&
      !isSyncEndpoint &&
      !clientVersion;

    if (
      path === '/' ||
      path === '/health' ||
      path.startsWith('/v1/config') ||
      path.startsWith('/v1/releases') ||
      path.startsWith('/api/docs') ||
      path.startsWith('/docs') ||
      path.startsWith('/swagger') ||
      path.includes('swagger') ||
      isExemptWebClient
    ) {
      return true;
    }

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
