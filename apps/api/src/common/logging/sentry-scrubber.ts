import { PiiScrubber } from './pii-scrubber';

export interface SentryEvent {
  request?: {
    headers?: Record<string, string>;
    data?: any;
    cookies?: any;
    url?: string;
  };
  breadcrumbs?: Array<{
    category?: string;
    message?: string;
    data?: any;
  }>;
  extra?: Record<string, any>;
  user?: {
    id?: string;
    email?: string;
    username?: string;
    ip_address?: string;
  };
}

export class SentryScrubber {
  /**
   * Sentry `beforeSend` hook that scrubs headers, request bodies, breadcrumbs, and user metadata.
   */
  static beforeSend(event: SentryEvent): SentryEvent {
    // 1. Scrub HTTP request headers and cookies
    if (event.request) {
      if (event.request.headers) {
        const scrubbedHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(event.request.headers)) {
          const lower = k.toLowerCase();
          if (
            lower === 'authorization' ||
            lower === 'cookie' ||
            lower === 'set-cookie' ||
            lower === 'x-api-key'
          ) {
            scrubbedHeaders[k] = '[REDACTED]';
          } else {
            scrubbedHeaders[k] = PiiScrubber.scrubString(v);
          }
        }
        event.request.headers = scrubbedHeaders;
      }

      if (event.request.cookies) {
        event.request.cookies = '[REDACTED]';
      }

      if (event.request.data) {
        event.request.data = PiiScrubber.scrub(event.request.data);
      }
    }

    // 2. Scrub breadcrumbs
    if (event.breadcrumbs && Array.isArray(event.breadcrumbs)) {
      event.breadcrumbs = event.breadcrumbs.map((crumb) => {
        return {
          ...crumb,
          message: crumb.message
            ? PiiScrubber.scrubString(crumb.message)
            : undefined,
          data: crumb.data ? PiiScrubber.scrub(crumb.data) : undefined,
        };
      });
    }

    // 3. Scrub extra metadata
    if (event.extra) {
      event.extra = PiiScrubber.scrub(event.extra);
    }

    // 4. Scrub user IP address and PII (only retain user ID)
    if (event.user) {
      delete event.user.ip_address;
      if (event.user.email) {
        event.user.email = '[REDACTED]';
      }
    }

    return event;
  }
}

export const sentryEventScrubber = (event: any) =>
  SentryScrubber.beforeSend(event);
