import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  normalizeClientType,
  SessionActivityService,
} from './session-activity.service';

const SKIPPED_AUTH_PATHS = [
  '/v1/auth/login',
  '/v1/auth/logout',
  '/v1/auth/refresh',
  '/v1/auth/heartbeat',
  '/v1/auth/change-password',
  '/v1/auth/switch-area',
  '/v1/auth/reset-password',
  '/v1/auth/forgot-password',
];

interface AuthenticatedHttpRequest {
  user?: { userId?: string };
  originalUrl?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: { deviceId?: unknown };
}

/**
 * Global interceptor that records user activity for authenticated requests.
 * Auth lifecycle endpoints manage their own session transitions directly.
 */
@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityInterceptor.name);

  constructor(
    @Optional()
    private readonly sessionActivityService?: SessionActivityService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (this.sessionActivityService && context.getType() === 'http') {
      const req = context.switchToHttp().getRequest<AuthenticatedHttpRequest>();
      const userId = req?.user?.userId;
      const rawUrl = req?.originalUrl || req?.url || '';
      const path = rawUrl.split('?')[0];

      const shouldSkip = SKIPPED_AUTH_PATHS.some(
        (skipped) => path === skipped || path.startsWith(`${skipped}/`),
      );

      if (userId && !shouldSkip) {
        const headers = req?.headers ?? {};
        const headerClientType =
          typeof headers['x-client-type'] === 'string'
            ? headers['x-client-type']
            : undefined;
        const headerDeviceId =
          typeof headers['x-device-id'] === 'string'
            ? headers['x-device-id']
            : undefined;
        const bodyDeviceId =
          typeof req?.body?.deviceId === 'string'
            ? req.body.deviceId
            : undefined;
        const deviceId = headerDeviceId ?? bodyDeviceId;
        const userAgent =
          typeof headers['user-agent'] === 'string'
            ? headers['user-agent']
            : undefined;

        const clientType = normalizeClientType({
          clientType: headerClientType,
          deviceId,
          hasAppVersionHeader: Boolean(headers['x-app-version']),
          userAgent,
        });

        try {
          await this.sessionActivityService.touchActivity({
            profileId: userId,
            clientType,
            deviceId,
          });
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : 'Unknown activity tracking error';
          this.logger.warn(
            `Failed to record activity for ${userId}: ${message}`,
          );
        }
      }
    }

    return next.handle();
  }
}
