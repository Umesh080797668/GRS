import { Test, TestingModule } from '@nestjs/testing';
import { ReleasesController, CreateReleaseDto } from './releases.controller';
import { ReleasesService } from './releases.service';
import { PrismaService } from '../prisma/prisma.service';
import { Response, Request } from 'express';

describe('Releases (Self-Hosted APK Update System)', () => {
  let controller: ReleasesController;
  let service: ReleasesService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      appRelease: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReleasesController],
      providers: [
        ReleasesService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    controller = module.get<ReleasesController>(ReleasesController);
    service = module.get<ReleasesService>(ReleasesService);
  });

  describe('Step 1 & Step 3: Release Manifest & Endpoints', () => {
    it('GET /v1/releases/latest throws NotFoundException when no release is published', async () => {
      mockPrisma.appRelease.findFirst.mockResolvedValue(null);
      await expect(controller.getLatest()).rejects.toThrow();
    });

    it('GET /v1/releases/latest returns authoritative ReleaseManifest when release exists', async () => {
      mockPrisma.appRelease.findFirst.mockResolvedValue({
        id: 'rel-1',
        version: '1.1.0',
        minSupportedVersion: '1.0.0',
        apkUrl:
          'https://github.com/Umesh080797668/GRS/releases/download/v1.1.0/app-release.apk',
        checksum:
          '436be008aacf19b183fd27fdb75cf885e51cbefe52c5968c7537a66619abf475',
        releaseNotes: 'OTA update system release',
        releasedAt: new Date(),
      });

      const manifest = await controller.getLatest();
      expect(manifest.version).toBe('1.1.0');
      expect(manifest.minSupportedVersion).toBe('1.0.0');
      expect(manifest.sha256).toBe(
        '436be008aacf19b183fd27fdb75cf885e51cbefe52c5968c7537a66619abf475',
      );
      expect(manifest.apkUrl).toContain('github.com/Umesh080797668/GRS/releases');
      expect(manifest.mandatory).toBe(false);
    });

    it('GET /v1/releases/manifest returns identical manifest specification', async () => {
      mockPrisma.appRelease.findFirst.mockResolvedValue({
        id: 'rel-1',
        version: '1.1.0',
        minSupportedVersion: '1.0.0',
        apkUrl:
          'https://github.com/Umesh080797668/GRS/releases/download/v1.1.0/app-release.apk',
        checksum:
          '436be008aacf19b183fd27fdb75cf885e51cbefe52c5968c7537a66619abf475',
        releaseNotes: 'OTA update system release',
        releasedAt: new Date(),
      });

      const manifest = await controller.getManifest();
      expect(manifest.version).toBe('1.1.0');
      expect(manifest.apkUrl).toContain('releases/download');
      expect(manifest.sha256).toBeDefined();
    });

    it('GET /v1/releases/download redirects (302) to GitHub Releases to prevent Vercel 4.5MB payload limit', async () => {
      mockPrisma.appRelease.findFirst.mockResolvedValue({
        id: 'rel-1',
        version: '1.0.1',
        minSupportedVersion: '1.0.0',
        apkUrl:
          'https://github.com/Umesh080797668/GRS/releases/download/v1.0.1/app-release.apk',
        checksum:
          '436be008aacf19b183fd27fdb75cf885e51cbefe52c5968c7537a66619abf475',
        releaseNotes: 'OTA update system release',
        releasedAt: new Date(),
      });

      const redirectMock = jest.fn();
      const mockRes = {
        redirect: redirectMock,
        setHeader: jest.fn(),
        sendFile: jest.fn(),
      } as unknown as Response;

      await controller.downloadApk(mockRes);

      expect(redirectMock).toHaveBeenCalledWith(
        302,
        'https://github.com/Umesh080797668/GRS/releases/download/v1.0.1/app-release.apk',
      );
    });

    it('GET /v1/releases/download throws NotFoundException when binary is not found locally or externally', async () => {
      jest.spyOn(require('fs'), 'existsSync').mockReturnValue(false);

      mockPrisma.appRelease.findFirst.mockResolvedValue({
        id: 'rel-1',
        version: '1.1.0',
        minSupportedVersion: '1.0.0',
        apkUrl: '/v1/releases/download',
        checksum: 'abc',
        releaseNotes: 'test',
        releasedAt: new Date(),
      });

      const mockRes = {
        redirect: jest.fn(),
        setHeader: jest.fn(),
        sendFile: jest.fn(),
      } as unknown as Response;

      await expect(controller.downloadApk(mockRes)).rejects.toThrow();
      jest.restoreAllMocks();
    });
  });

  describe('Step 5: Protect the update process', () => {
    it('POST /v1/releases accepts valid X-Release-Secret header from CI automation', async () => {
      process.env.RELEASE_SECRET = 'ci-super-secret-key-12345';

      const dto: CreateReleaseDto = {
        version: '1.0.2',
        minSupportedVersion: '1.0.0',
        apkUrl:
          'https://github.com/Umesh080797668/GRS/releases/download/v1.0.2/app-release.apk',
        sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        releaseNotes: 'Automated patch',
      };

      mockPrisma.appRelease.create.mockResolvedValue({
        id: 'rel-2',
        version: dto.version,
        minSupportedVersion: dto.minSupportedVersion,
        apkUrl: dto.apkUrl,
        checksum: dto.sha256,
        releaseNotes: dto.releaseNotes,
        releasedAt: new Date(),
      });

      const mockReq = {
        headers: {
          'x-release-secret': 'ci-super-secret-key-12345',
        },
      } as unknown as Request;

      const result = await controller.createRelease(dto, mockReq);
      expect(result.version).toBe('1.0.2');
      expect(mockPrisma.appRelease.create).toHaveBeenCalled();
    });

    it('POST /v1/releases rejects unauthenticated request without token or secret', async () => {
      delete process.env.RELEASE_SECRET;

      const dto: CreateReleaseDto = {
        version: '1.0.3',
        minSupportedVersion: '1.0.0',
        apkUrl: 'https://example.com/app.apk',
        sha256: 'abc',
      };

      const mockReq = {
        headers: {},
      } as unknown as Request;

      await expect(controller.createRelease(dto, mockReq)).rejects.toThrow();
    });
  });
});
