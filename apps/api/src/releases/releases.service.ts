import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReleaseManifest } from './release-manifest.interface';

export type LatestReleaseResponse = ReleaseManifest;

@Injectable()
export class ReleasesService {
  constructor(private readonly prisma: PrismaService) { }

  async getLatestRelease(): Promise<ReleaseManifest> {
    const release = await this.prisma.appRelease.findFirst({
      orderBy: { releasedAt: 'desc' },
    });

    if (!release) {
      throw new NotFoundException({
        code: 'RELEASE_NOT_FOUND',
        message: 'No published application releases found.',
      });
    }

    return {
      version: release.version,
      buildNumber: 2,
      minSupportedVersion: release.minSupportedVersion,
      apkUrl: release.apkUrl,
      sha256: release.checksum,
      checksum: release.checksum,
      releaseNotes: release.releaseNotes,
      releasedAt: release.releasedAt,
      mandatory: false,
    };
  }

  async createRelease(data: {
    version: string;
    minSupportedVersion: string;
    apkUrl: string;
    checksum?: string;
    sha256?: string;
    releaseNotes?: string;
    buildNumber?: number;
    fileSize?: number;
    mandatory?: boolean;
  }): Promise<ReleaseManifest> {
    const hash = (data.sha256 || data.checksum || '').trim();
    const created = await this.prisma.appRelease.create({
      data: {
        version: data.version,
        minSupportedVersion: data.minSupportedVersion,
        apkUrl: data.apkUrl,
        checksum: hash,
        releaseNotes: data.releaseNotes,
      },
    });

    return {
      version: created.version,
      buildNumber: data.buildNumber ?? 2,
      minSupportedVersion: created.minSupportedVersion,
      apkUrl: created.apkUrl,
      sha256: created.checksum,
      checksum: created.checksum,
      fileSize: data.fileSize,
      releaseNotes: created.releaseNotes,
      releasedAt: created.releasedAt,
      mandatory: data.mandatory ?? false,
    };
  }
}
