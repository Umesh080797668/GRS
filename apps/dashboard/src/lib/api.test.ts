import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ApiClient, ApiError } from './api.ts';

describe('ApiClient - Single-flight refresh (Bug 4)', () => {
  let client: ApiClient;
  let localStorageMock: Record<string, string>;
  let fetchCallCount: number;
  let refreshCallCount: number;

  beforeEach(() => {
    localStorageMock = {
      grs_access_token: 'initial-expired-token',
      grs_refresh_token: 'valid-refresh-token',
      grs_user: JSON.stringify({ id: 'user-1', userCode: 'GRS1234567890', role: 'admin' }),
    };

    fetchCallCount = 0;
    refreshCallCount = 0;

    // Mock global localStorage
    (globalThis as any).localStorage = {
      getItem: (key: string) => localStorageMock[key] ?? null,
      setItem: (key: string, val: string) => {
        localStorageMock[key] = val;
      },
      removeItem: (key: string) => {
        delete localStorageMock[key];
      },
    };

    // Mock global window and location
    (globalThis as any).window = {
      location: {
        pathname: '/records',
        hostname: 'localhost',
        href: '/records',
      },
    };

    client = new ApiClient();
  });

  it('coalesces multiple concurrent 401 refreshes into a single flight', async () => {
    // Mock global fetch
    (globalThis as any).fetch = async (url: string, options: any = {}) => {
      fetchCallCount++;

      if (url.includes('/v1/auth/refresh')) {
        refreshCallCount++;
        // Small delay to simulate in-flight network request
        await new Promise((r) => setTimeout(r, 50));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            accessToken: 'new-refreshed-access-token',
            refreshToken: 'new-refreshed-refresh-token',
          }),
        };
      }

      const authHeader = options?.headers?.['Authorization'] || '';
      if (authHeader.includes('initial-expired-token')) {
        // Return 401 for expired token
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({ message: 'Token expired' }),
        };
      }

      if (authHeader.includes('new-refreshed-access-token')) {
        // Return 200 for new token
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: 'success', path: url }),
        };
      }

      return {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ message: 'Invalid token' }),
      };
    };

    // Launch 3 concurrent requests simultaneously with the expired token
    const [res1, res2, res3] = await Promise.all([
      (client as any).request('/test-1'),
      (client as any).request('/test-2'),
      (client as any).request('/test-3'),
    ]);

    // All three should have succeeded after refresh
    assert.strictEqual(res1.data, 'success');
    assert.strictEqual(res2.data, 'success');
    assert.strictEqual(res3.data, 'success');

    // ONLY ONE refresh request must have been made (single flight)!
    assert.strictEqual(refreshCallCount, 1);

    // Access token is securely kept in memory, not left in localStorage
    assert.strictEqual(client.getAccessToken(), 'new-refreshed-access-token');
    assert.strictEqual(localStorageMock.grs_access_token, undefined);
    assert.strictEqual(localStorageMock.grs_refresh_token, 'new-refreshed-refresh-token');
  });

  it('calls clearSession when refresh itself fails', async () => {
    (globalThis as any).fetch = async (url: string) => {
      if (url.includes('/v1/auth/refresh')) {
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({ message: 'Refresh token invalid' }),
        };
      }
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ message: 'Token expired' }),
      };
    };

    await assert.rejects(
      async () => {
        await (client as any).request('/test-unauthorized');
      },
      {
        message: 'Session expired. Please sign in again.',
      },
    );

    // Session must be cleared
    assert.strictEqual(localStorageMock.grs_access_token, undefined);
    assert.strictEqual(localStorageMock.grs_refresh_token, undefined);
  });

  it('throws typed ApiError translating message_key instead of falling back to HTTP 400', async () => {
    (globalThis as any).fetch = async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: { get: () => null },
      json: async () => ({
        code: 'AUTH_INVALID',
        message_key: 'errors.auth.invalid_credentials',
      }),
    });

    try {
      await (client as any).request('/v1/auth/login', {}, false);
      assert.fail('Should have thrown ApiError');
    } catch (err: any) {
      assert.ok(err instanceof ApiError);
      assert.strictEqual(err.status, 400);
      assert.strictEqual(err.code, 'AUTH_INVALID');
      assert.strictEqual(err.messageKey, 'errors.auth.invalid_credentials');
      // Should translate to English text rather than "HTTP 400: Bad Request"
      assert.strictEqual(
        err.message,
        'Invalid User ID or password. Please verify your credentials.',
      );
    }
  });

  it('handles HTTP 426 upgrade required and sets code UPGRADE_REQUIRED', async () => {
    (globalThis as any).fetch = async () => ({
      ok: false,
      status: 426,
      statusText: 'Upgrade Required',
      headers: { get: () => null },
      json: async () => ({
        minVersion: '2.0.0',
      }),
    });

    try {
      await (client as any).request('/v1/data', {}, false);
      assert.fail('Should have thrown ApiError');
    } catch (err: any) {
      assert.ok(err instanceof ApiError);
      assert.strictEqual(err.status, 426);
      assert.strictEqual(err.code, 'UPGRADE_REQUIRED');
      assert.strictEqual(err.messageKey, 'errors.upgrade_required');
      assert.ok(err.message.includes('HTTP 426'));
    }
  });

  it('extracts Retry-After header on 429 rate limit', async () => {
    (globalThis as any).fetch = async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: {
        get: (h: string) => (h.toLowerCase() === 'retry-after' ? '45' : null),
      },
      json: async () => ({
        code: 'RATE_LIMITED',
        message_key: 'errors.rate_limited',
      }),
    });

    try {
      await (client as any).request('/v1/data', {}, false);
      assert.fail('Should have thrown ApiError');
    } catch (err: any) {
      assert.ok(err instanceof ApiError);
      assert.strictEqual(err.status, 429);
      assert.strictEqual(err.code, 'RATE_LIMITED');
      assert.strictEqual(err.retryAfter, 45);
    }
  });
});
