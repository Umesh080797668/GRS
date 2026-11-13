import {
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { Readable } from 'stream';

export interface SignedUrlResult {
  signedUrl: string;
  expiresInSeconds: number;
}

@Injectable()
export class ExportStorageService {
  private readonly logger = new Logger(ExportStorageService.name);
  private readonly bucketName: string;
  private readonly supabaseUrl: string;
  private readonly serviceRoleKey: string;
  private bucketVerified = false;

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.bucketName =
      this.configService?.get<string>('EXPORT_STORAGE_BUCKET') ||
      process.env.EXPORT_STORAGE_BUCKET ||
      'grs-exports';
    this.supabaseUrl = (
      this.configService?.get<string>('SUPABASE_URL') ||
      process.env.SUPABASE_URL ||
      ''
    )
      .trim()
      .replace(/\/+$/, '');
    this.serviceRoleKey = (
      this.configService?.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      ''
    ).trim();
  }

  getBucketName(): string {
    return this.bucketName;
  }

  isConfigured(): boolean {
    return this.supabaseUrl.length > 0 && this.serviceRoleKey.length > 0;
  }

  private ensureConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException({
        code: 'EXPORT_STORAGE_NOT_CONFIGURED',
        message:
          'Private Supabase Storage is not configured for export uploads',
      });
    }
  }

  private encodeObjectPath(objectPath: string): string {
    return objectPath
      .replace(/^\/+/, '')
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
  }

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      ...(extra || {}),
    };
  }

  /**
   * Ensures the private exports bucket exists in Supabase Storage.
   */
  async ensurePrivateBucketExists(): Promise<void> {
    this.ensureConfigured();
    if (this.bucketVerified) {
      return;
    }

    const bucketUrl = `${this.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(this.bucketName)}`;
    const inspectRes = await fetch(bucketUrl, {
      method: 'GET',
      headers: this.authHeaders(),
    });

    if (inspectRes.ok) {
      const meta = (await inspectRes.json().catch(() => ({}))) as {
        public?: boolean;
      };
      if (meta.public === true) {
        this.logger.warn(
          `Bucket ${this.bucketName} is public; enforcing private visibility`,
        );
        await fetch(bucketUrl, {
          method: 'PUT',
          headers: this.authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            id: this.bucketName,
            name: this.bucketName,
            public: false,
          }),
        });
      }
      this.bucketVerified = true;
      return;
    }

    if (inspectRes.status === 404 || inspectRes.status === 400) {
      const createRes = await fetch(`${this.supabaseUrl}/storage/v1/bucket`, {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id: this.bucketName,
          name: this.bucketName,
          public: false,
        }),
      });
      if (createRes.ok || createRes.status === 409) {
        this.bucketVerified = true;
        return;
      }
      const errBody = await createRes.text().catch(() => '');
      throw new ServiceUnavailableException({
        code: 'EXPORT_BUCKET_CREATE_FAILED',
        message: `Failed to provision private export bucket (${createRes.status}): ${errBody.slice(0, 200)}`,
      });
    }

    const inspectErr = await inspectRes.text().catch(() => '');
    throw new ServiceUnavailableException({
      code: 'EXPORT_BUCKET_INSPECT_FAILED',
      message: `Unable to verify export storage bucket (${inspectRes.status}): ${inspectErr.slice(0, 200)}`,
    });
  }

  /**
   * Streams a local export artifact from disk directly into private Supabase Storage.
   */
  async uploadFromFile(
    objectPath: string,
    localFilePath: string,
    contentType: string,
  ): Promise<{ path: string; byteLength: number }> {
    await this.ensurePrivateBucketExists();
    const stat = await fs.promises.stat(localFilePath);
    const encodedPath = this.encodeObjectPath(objectPath);
    const uploadUrl = `${this.supabaseUrl}/storage/v1/object/${encodeURIComponent(this.bucketName)}/${encodedPath}`;

    const fileStream = fs.createReadStream(localFilePath);
    const webStream = Readable.toWeb(fileStream) as any;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: this.authHeaders({
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'x-upsert': 'true',
      }),
      body: webStream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new ServiceUnavailableException({
        code: 'EXPORT_UPLOAD_FAILED',
        message: `Storage upload failed (${response.status}): ${errText.slice(0, 200)}`,
      });
    }

    return {
      path: objectPath,
      byteLength: stat.size,
    };
  }

  /**
   * Uploads an in-memory Buffer to private Supabase Storage.
   */
  async uploadBuffer(
    objectPath: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<{ path: string; byteLength: number }> {
    await this.ensurePrivateBucketExists();
    const encodedPath = this.encodeObjectPath(objectPath);
    const uploadUrl = `${this.supabaseUrl}/storage/v1/object/${encodeURIComponent(this.bucketName)}/${encodedPath}`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: this.authHeaders({
        'Content-Type': contentType,
        'Content-Length': String(buffer.byteLength),
        'x-upsert': 'true',
      }),
      body: new Uint8Array(buffer),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new ServiceUnavailableException({
        code: 'EXPORT_UPLOAD_FAILED',
        message: `Storage upload failed (${response.status}): ${errText.slice(0, 200)}`,
      });
    }

    return {
      path: objectPath,
      byteLength: buffer.byteLength,
    };
  }

  /**
   * Generates a short-lived signed download URL (default 24h) for a private Storage object.
   */
  async createSignedUrl(
    objectPath: string,
    expiresInSeconds = 86400,
  ): Promise<SignedUrlResult> {
    this.ensureConfigured();
    const clampedSeconds = Math.max(
      60,
      Math.min(86400, Math.floor(expiresInSeconds)),
    );
    const encodedPath = this.encodeObjectPath(objectPath);
    const signUrl = `${this.supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(this.bucketName)}/${encodedPath}`;

    const response = await fetch(signUrl, {
      method: 'POST',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn: clampedSeconds }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new ServiceUnavailableException({
        code: 'EXPORT_SIGN_URL_FAILED',
        message: `Signed URL generation failed (${response.status}): ${errText.slice(0, 200)}`,
      });
    }

    const payload = (await response.json()) as {
      signedURL?: string;
      signedUrl?: string;
    };
    const rawSigned = payload.signedURL || payload.signedUrl || '';
    if (!rawSigned) {
      throw new ServiceUnavailableException({
        code: 'EXPORT_SIGN_URL_EMPTY',
        message: 'Storage sign endpoint returned an empty URL',
      });
    }

    const fullSignedUrl = rawSigned.startsWith('http')
      ? rawSigned
      : `${this.supabaseUrl}/storage/v1${rawSigned.startsWith('/') ? '' : '/'}${rawSigned}`;

    return {
      signedUrl: fullSignedUrl,
      expiresInSeconds: clampedSeconds,
    };
  }

  /**
   * Removes an expired or temporary object from private Storage.
   */
  async deleteObject(objectPath: string): Promise<void> {
    if (!this.isConfigured()) return;
    const encodedPath = this.encodeObjectPath(objectPath);
    const deleteUrl = `${this.supabaseUrl}/storage/v1/object/${encodeURIComponent(this.bucketName)}/${encodedPath}`;
    await fetch(deleteUrl, {
      method: 'DELETE',
      headers: this.authHeaders(),
    }).catch(() => undefined);
  }
}
