import { Injectable } from '@nestjs/common';
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
      // Fallback release manifest pointing to GitHub release storage
      return {
        version: '1.0.1',
        buildNumber: 2,
        minSupportedVersion: '1.0.0',
        apkUrl:
          'https://github.com/Umesh080797668/GRS/releases/download/v1.0.1/app-release.apk',
        sha256:
          '436be008aacf19b183fd27fdb75cf885e51cbefe52c5968c7537a66619abf475',
        checksum:
          '436be008aacf19b183fd27fdb75cf885e51cbefe52c5968c7537a66619abf475',
        fileSize: 70685640,
        releaseNotes:
          'Security hardening, in-app updates, and offline sync optimizations.',
        releasedAt: new Date(),
        mandatory: false,
      };
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
