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
      // Fallback release served directly by this API server
      return {
        version: '1.0.1',
        minSupportedVersion: '1.0.0',
        apkUrl: '/v1/releases/download',
        checksum: '436be008aacf19b183fd27fdb75cf885e51cbefe52c5968c7537a66619abf475',
        releaseNotes: 'Security hardening, in-app updates, and offline sync optimizations.',
        releasedAt: new Date(),
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
