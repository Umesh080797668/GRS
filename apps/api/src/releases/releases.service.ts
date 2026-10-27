import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LatestReleaseResponse {
  version: string;
  minSupportedVersion: string;
  apkUrl: string;
  checksum: string;
  releaseNotes: string | null;
  releasedAt: Date;
}

@Injectable()
export class ReleasesService {
  constructor(private readonly prisma: PrismaService) { }

  async getLatestRelease(): Promise<LatestReleaseResponse> {
    const release = await this.prisma.appRelease.findFirst({
      orderBy: { releasedAt: 'desc' },
    });

    if (!release) {
      // Fallback baseline release if table hasn't been seeded yet
      return {
        version: '1.0.0',
        minSupportedVersion: '1.0.0',
        apkUrl: 'https://releases.grs.gov.lk/app-release.apk',
        checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        releaseNotes: 'Initial production release',
        releasedAt: new Date('2026-10-26T00:00:00Z'),
      };
    }

    return {
      version: release.version,
      minSupportedVersion: release.minSupportedVersion,
      apkUrl: release.apkUrl,
      checksum: release.checksum,
      releaseNotes: release.releaseNotes,
      releasedAt: release.releasedAt,
    };
  }

  async createRelease(data: {
    version: string;
    minSupportedVersion: string;
    apkUrl: string;
    checksum: string;
    releaseNotes?: string;
  }): Promise<LatestReleaseResponse> {
    const created = await this.prisma.appRelease.create({
      data: {
        version: data.version,
        minSupportedVersion: data.minSupportedVersion,
        apkUrl: data.apkUrl,
        checksum: data.checksum,
        releaseNotes: data.releaseNotes,
      },
    });

    return {
      version: created.version,
      minSupportedVersion: created.minSupportedVersion,
      apkUrl: created.apkUrl,
      checksum: created.checksum,
      releaseNotes: created.releaseNotes,
      releasedAt: created.releasedAt,
    };
  }
}
