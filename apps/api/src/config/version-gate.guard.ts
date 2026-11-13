import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  Optional
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from './app-config.service';

@Injectable()
export class VersionGateGuard implements CanActivate {
  private readonly fallbackJwtService = new JwtService();

  constructor(
    private readonly configService: AppConfigService,
    @Optional() private readonly jwtService?: JwtService,
  ) { }

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
        const token = authHeader.substring(7).trim();
        const jwtSecret = process.env.JWT_ACCESS_SECRET;
        const verifier = this.jwtService || this.fallbackJwtService;
        let payload: any = null;
        if (jwtSecret) {
          payload = verifier.verify(token, { secret: jwtSecret });
        } else {
          payload = verifier.decode(token);
        }
        if (
          payload?.role === 'team_member' ||
          payload?.role === 'cdc_secretary'
        ) {
          isMobileCaller = true;
        }
      } catch {
        // Verification failed or invalid token; ignore
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

    const isDocsEndpoint =
      process.env.NODE_ENV !== 'production' &&
      (path.startsWith('/api/docs') ||
        path.startsWith('/docs') ||
        path === '/swagger' ||
        path.startsWith('/swagger/'));

    if (
      path === '/' ||
      path === '/health' ||
      path.startsWith('/v1/config') ||
      path.startsWith('/v1/releases') ||
      isDocsEndpoint ||
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
