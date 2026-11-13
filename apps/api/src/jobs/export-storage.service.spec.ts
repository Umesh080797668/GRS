import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ExportStorageService } from './export-storage.service';

describe('ExportStorageService (M7.1)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('fails closed when SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const svc = new ExportStorageService({
      get: () => undefined,
    } as unknown as ConfigService);

    expect(svc.isConfigured()).toBe(false);
    await expect(svc.ensurePrivateBucketExists()).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(
      svc.createSignedUrl('exports/job-1/report.xlsx', 3600),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('creates private bucket when 404 and uploads stream + signs 24h URL', async () => {
    const tmpFile = path.join(os.tmpdir(), `storage-spec-${Date.now()}.xlsx`);
    await fs.promises.writeFile(tmpFile, Buffer.from('xlsx-binary-payload'));

    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      // 1. GET bucket -> 404
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      // 2. POST create bucket -> 200
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ name: 'grs-exports' }), { status: 200 }),
      )
      // 3. POST upload object -> 200
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ Key: 'grs-exports/exports/j1/r.xlsx' }), {
          status: 200,
        }),
      )
      // 4. POST createSignedUrl -> 200
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            signedURL: '/object/sign/grs-exports/exports/j1/r.xlsx?token=abc',
          }),
          { status: 200 },
        ),
      );

    try {
      const svc = new ExportStorageService({
        get: (key: string) => {
          if (key === 'SUPABASE_URL') return 'https://example.supabase.co/';
          if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-secret';
          if (key === 'EXPORT_STORAGE_BUCKET') return 'grs-exports';
          return undefined;
        },
      } as unknown as ConfigService);

      const uploaded = await svc.uploadFromFile(
        'exports/j1/r.xlsx',
        tmpFile,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(uploaded.path).toBe('exports/j1/r.xlsx');
      expect(uploaded.byteLength).toBe(
        Buffer.byteLength('xlsx-binary-payload'),
      );

      // Verify bucket creation requested public: false
      const createCall = fetchMock.mock.calls[1];
      expect(createCall[0]).toBe(
        'https://example.supabase.co/storage/v1/bucket',
      );
      expect(JSON.parse(String(createCall[1]?.body))).toEqual({
        id: 'grs-exports',
        name: 'grs-exports',
        public: false,
      });

      const signed = await svc.createSignedUrl('exports/j1/r.xlsx', 999999);
      expect(signed.expiresInSeconds).toBe(86400);
      expect(signed.signedUrl).toBe(
        'https://example.supabase.co/storage/v1/object/sign/grs-exports/exports/j1/r.xlsx?token=abc',
      );
    } finally {
      await fs.promises.unlink(tmpFile).catch(() => undefined);
    }
  });

  it('enforces private visibility if bucket metadata says public: true', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'grs-exports', public: true }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const svc = new ExportStorageService({
      get: (key: string) => {
        if (key === 'SUPABASE_URL') return 'https://example.supabase.co';
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-secret';
        return undefined;
      },
    } as unknown as ConfigService);

    await svc.ensurePrivateBucketExists();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PUT');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      public: false,
    });
  });
});
