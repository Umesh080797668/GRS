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

  it('handles 204 No Content without throwing and returns undefined', async () => {
    (globalThis as any).fetch = async () => ({
      ok: true,
      status: 204,
      statusText: 'No Content',
      text: async () => '',
    });

    const result = await (client as any).request('/v1/accounts/user-1/deactivate', { method: 'PATCH' }, false);
    assert.strictEqual(result, undefined);
  });

  it('handles empty response bodies on 200 OK without throwing and returns undefined', async () => {
    (globalThis as any).fetch = async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '',
    });

    const result = await (client as any).request('/v1/data', {}, false);
    assert.strictEqual(result, undefined);
  });

  it('sends X-App-Version and X-Client-Type: web headers on all requests', async () => {
    let capturedHeaders: Record<string, string> = {};
    (globalThis as any).fetch = async (_url: string, options: any = {}) => {
      capturedHeaders = options.headers || {};
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ ok: true }),
      };
    };

    await (client as any).request('/v1/config', {}, false);
    assert.strictEqual(capturedHeaders['X-Client-Type'], 'web');
    assert.strictEqual(capturedHeaders['X-App-Version'], '1.0.0');
  });

  it('downloadImportErrors uses request flow with auth retry and returns CSV text', async () => {
    let callCount = 0;
    let authHeaderSent = '';
    (globalThis as any).fetch = async (url: string, options: any = {}) => {
      if (url.includes('/v1/auth/refresh')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            accessToken: 'refreshed-token-999',
            refreshToken: 'refreshed-refresh-token-999',
          }),
        };
      }

      callCount++;
      authHeaderSent = options.headers?.Authorization;
      if (callCount === 1) {
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({ code: 'UNAUTHORIZED', message: 'Token expired' }),
          headers: { get: () => null },
        };
      }

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => 'house_no,errors\n101,Duplicate house\n',
      };
    };

    client.setAccessToken('old-token');
    localStorageMock['grs_refresh_token'] = 'valid-refresh-token';

    const csv = await client.downloadImportErrors('batch-123');
    assert.strictEqual(csv, 'house_no,errors\n101,Duplicate house\n');
    assert.strictEqual(authHeaderSent, 'Bearer refreshed-token-999');
    assert.strictEqual(callCount, 2);
  });

  it('duplicate review endpoints serialize filters and payloads cleanly', async () => {
    const requests: Array<{ url: string; method?: string; body?: any }> = [];
    (globalThis as any).fetch = async (url: string, options: any = {}) => {
      requests.push({
        url,
        method: options.method || 'GET',
        body: options.body ? JSON.parse(options.body) : undefined,
      });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ items: [], openCount: 4 }),
      };
    };

    client.setAccessToken('admin-token');

    const listRes = await client.getDuplicates({
      status: 'open',
      classification: 'probable',
      minScore: 70,
      districtId: 'dist-1',
      cursor: 'cursor-1',
      limit: 20,
    });
    assert.strictEqual(listRes.openCount, 4);

    await client.confirmDuplicate('cand-1', {
      canonicalClientId: 'client-a',
      reason: 'Verified duplicate',
    });
    await client.dismissDuplicate('cand-2', { reason: 'Twins in household' });

    assert.strictEqual(requests.length, 3);
    assert.strictEqual(
      requests[0].url.includes('/v1/duplicates?'),
      true,
    );
    assert.strictEqual(requests[0].url.includes('status=open'), true);
    assert.strictEqual(requests[0].url.includes('classification=probable'), true);
    assert.strictEqual(requests[0].url.includes('minScore=70'), true);
    assert.strictEqual(requests[0].url.includes('districtId=dist-1'), true);
    assert.strictEqual(requests[0].url.includes('cursor=cursor-1'), true);
    assert.strictEqual(requests[0].url.includes('limit=20'), true);
    assert.strictEqual(requests[0].method, 'GET');

    assert.strictEqual(
      requests[1].url.endsWith('/v1/duplicates/cand-1/confirm'),
      true,
    );
    assert.strictEqual(requests[1].method, 'POST');
    assert.deepStrictEqual(requests[1].body, {
      canonicalClientId: 'client-a',
      reason: 'Verified duplicate',
    });

    assert.strictEqual(
      requests[2].url.endsWith('/v1/duplicates/cand-2/dismiss'),
      true,
    );
    assert.strictEqual(requests[2].method, 'POST');
    assert.deepStrictEqual(requests[2].body, {
      reason: 'Twins in household',
    });
  });

  it('export & report preview endpoints serialize payloads and query filters properly', async () => {
    const requests: Array<{ url: string; method?: string; body?: any }> = [];
    (globalThis as any).fetch = async (url: string, options: any = {}) => {
      requests.push({
        url,
        method: options.method || 'GET',
        body: options.body ? JSON.parse(options.body) : undefined,
      });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ items: [], status: 'done' }),
      };
    };

    client.setAccessToken('admin-token');
    await client.createExport({
      kind: 'clients',
      format: 'csv',
      lang: 'si',
      filters: { districtId: 'dist-1' },
    });
    await client.listExports({ limit: 10 });
    await client.getExportJob('job-1');
    await client.getReportPreview({
      kind: 'interests',
      lang: 'ta',
      dsId: 'ds-9',
    });

    assert.strictEqual(requests.length, 4);
    assert.strictEqual(requests[0].url.endsWith('/v1/exports'), true);
    assert.strictEqual(requests[0].method, 'POST');
    assert.deepStrictEqual(requests[0].body, {
      kind: 'clients',
      format: 'csv',
      lang: 'si',
      filters: { districtId: 'dist-1' },
    });
    assert.strictEqual(requests[1].url.includes('/v1/exports?limit=10'), true);
    assert.strictEqual(requests[2].url.endsWith('/v1/exports/job-1'), true);
    assert.strictEqual(requests[3].url.includes('/v1/exports/preview?'), true);
    assert.strictEqual(requests[3].url.includes('kind=interests'), true);
    assert.strictEqual(requests[3].url.includes('lang=ta'), true);
    assert.strictEqual(requests[3].url.includes('dsId=ds-9'), true);
  });

  it('admin edit and delete endpoints dispatch expected HTTP methods, paths, and payloads', async () => {
    const requests: Array<{ url: string; method?: string; body?: any }> = [];
    (globalThis as any).fetch = async (url: string, options: any = {}) => {
      requests.push({
        url,
        method: options.method || 'GET',
        body: options.body ? JSON.parse(options.body) : undefined,
      });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ success: true }),
      };
    };

    client.setAccessToken('admin-token');
    await client.updateAccount('acc-1', { fullName: 'Updated Name', preferredLanguage: 'si' });
    await client.deleteAccount('acc-2');
    await client.updateDsDivision('ds-1', { nameEn: 'New DS' });
    await client.deleteDsDivision('ds-2');
    await client.updateGnDivision('gn-1', { gnNumber: '101/A', gnName: 'Pallekele' });
    await client.deleteGnDivision('gn-2');
    await client.updateTeam('tm-1', { teamNo: 4, maxMembers: 12 });
    await client.deleteTeam('tm-2');
    await client.updateHousehold('h-1', { houseNo: '102/B', houseLeaderName: 'K. Perera' });
    await client.deleteHousehold('h-2', 'Entered twice');
    await client.deleteClient('cl-1', 'Duplicate entry');

    assert.strictEqual(requests.length, 11);
    assert.strictEqual(requests[0].method, 'PATCH');
    assert.strictEqual(requests[0].url.endsWith('/v1/accounts/acc-1'), true);
    assert.deepStrictEqual(requests[0].body, { fullName: 'Updated Name', preferredLanguage: 'si' });

    assert.strictEqual(requests[1].method, 'DELETE');
    assert.strictEqual(requests[1].url.endsWith('/v1/accounts/acc-2'), true);

    assert.strictEqual(requests[2].method, 'PATCH');
    assert.strictEqual(requests[2].url.endsWith('/v1/areas/ds/ds-1'), true);
    assert.deepStrictEqual(requests[2].body, { nameEn: 'New DS' });

    assert.strictEqual(requests[3].method, 'DELETE');
    assert.strictEqual(requests[3].url.endsWith('/v1/areas/ds/ds-2'), true);

    assert.strictEqual(requests[4].method, 'PATCH');
    assert.strictEqual(requests[4].url.endsWith('/v1/areas/gn/gn-1'), true);
    assert.deepStrictEqual(requests[4].body, { gnNumber: '101/A', gnName: 'Pallekele' });

    assert.strictEqual(requests[5].method, 'DELETE');
    assert.strictEqual(requests[5].url.endsWith('/v1/areas/gn/gn-2'), true);

    assert.strictEqual(requests[6].method, 'PATCH');
    assert.strictEqual(requests[6].url.endsWith('/v1/areas/teams/tm-1'), true);
    assert.deepStrictEqual(requests[6].body, { teamNo: 4, maxMembers: 12 });

    assert.strictEqual(requests[7].method, 'DELETE');
    assert.strictEqual(requests[7].url.endsWith('/v1/areas/teams/tm-2'), true);

    assert.strictEqual(requests[8].method, 'PATCH');
    assert.strictEqual(requests[8].url.endsWith('/v1/houses/h-1'), true);
    assert.deepStrictEqual(requests[8].body, { houseNo: '102/B', houseLeaderName: 'K. Perera' });

    assert.strictEqual(requests[9].method, 'DELETE');
    assert.strictEqual(requests[9].url.endsWith('/v1/houses/h-2'), true);
    assert.deepStrictEqual(requests[9].body, { reason: 'Entered twice' });

    assert.strictEqual(requests[10].method, 'DELETE');
    assert.strictEqual(requests[10].url.endsWith('/v1/clients/cl-1'), true);
    assert.deepStrictEqual(requests[10].body, { reason: 'Duplicate entry' });
  });
});
