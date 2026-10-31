import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReleaseManifest } from './release-manifest.interface';

export type LatestReleaseResponse = ReleaseManifest;

@Injectable()
export class ReleasesService {
  private readonly logger = new Logger(ReleasesService.name);
  private cachedGithubRelease: ReleaseManifest | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

  constructor(private readonly prisma: PrismaService) { }

  /**
   * Compares two semantic version strings (e.g. "1.1.0" vs "1.0.0").
   * Returns:
   *  1 if v1 > v2
   * -1 if v1 < v2
   *  0 if v1 === v2
   */
  compareSemver(v1: string, v2: string): number {
    const clean = (v: string) =>
      v
        .split('+')[0]
        .split('-')[0]
        .replace(/[^0-9.]/g, '');

    const p1 = clean(v1)
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
    const p2 = clean(v2)
      .split('.')
      .map((n) => parseInt(n, 10) || 0);

    const maxLen = Math.max(p1.length, p2.length);
    for (let i = 0; i < maxLen; i++) {
      const num1 = p1[i] ?? 0;
      const num2 = p2[i] ?? 0;
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    return 0;
  }

  /**
   * Syncs the latest published release directly from GitHub Releases API.
   * If a release exists on GitHub, it automatically upserts it into the Prisma database.
   */
  async syncFromGitHub(): Promise<ReleaseManifest | null> {
    const repo =
      process.env.GITHUB_REPO ||
      process.env.GITHUB_REPOSITORY ||
      'Umesh080797668/GRS';

    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'GRS-Backend-Updater',
      };
      if (process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
      }

      const res = await fetch(
        `https://api.github.com/repos/${repo}/releases/latest`,
        { headers },
      );

      if (!res.ok) {
        this.logger.warn(
          `GitHub releases API returned ${res.status}: ${res.statusText}`,
        );
        return null;
      }

      const data = (await res.json()) as any;
      if (!data || !data.tag_name) return null;

      const tag = String(data.tag_name);
      const version = tag.replace(/^v/, '');
      const assets = Array.isArray(data.assets) ? data.assets : [];

      let manifestData: Partial<ReleaseManifest> = {};

      // Check if manifest.json asset is attached
      const manifestAsset = assets.find((a: any) => a.name === 'manifest.json');
      if (manifestAsset && manifestAsset.browser_download_url) {
        try {
          const mRes = await fetch(manifestAsset.browser_download_url);
          if (mRes.ok) {
            manifestData = (await mRes.json()) as Partial<ReleaseManifest>;
          }
        } catch (mErr) {
          this.logger.warn(`Failed to parse manifest.json asset: ${mErr}`);
        }
      }

      // Check APK asset
      const apkAsset = assets.find((a: any) =>
        String(a.name || '').endsWith('.apk'),
      );
      const apkUrl =
        manifestData.apkUrl ||
        apkAsset?.browser_download_url ||
        `https://github.com/${repo}/releases/download/${tag}/app-release.apk`;

      // Check checksum from asset digest, checksum.txt, or body
      let checksum = manifestData.checksum || manifestData.sha256 || '';
      if (!checksum && apkAsset?.digest?.startsWith('sha256:')) {
        checksum = apkAsset.digest.replace('sha256:', '');
      }
      if (!checksum) {
        const checksumAsset = assets.find(
          (a: any) => a.name === 'checksum.txt',
        );
        if (checksumAsset && checksumAsset.browser_download_url) {
          try {
            const cRes = await fetch(checksumAsset.browser_download_url);
            if (cRes.ok) {
              const text = await cRes.text();
              const match = text.match(/[a-f0-9]{64}/i);
              if (match) checksum = match[0];
            }
          } catch (_) { }
        }
      }

      const releaseNotes =
        manifestData.releaseNotes ||
        data.body ||
        `Release ${tag} from GitHub Releases`;
      const minSupportedVersion = manifestData.minSupportedVersion || '1.0.0';
      const releasedAt = manifestData.releasedAt
        ? new Date(manifestData.releasedAt)
        : data.published_at
          ? new Date(data.published_at)
          : new Date();
      const fileSize = manifestData.fileSize || apkAsset?.size;
      const buildNumber = manifestData.buildNumber || 2;
      const mandatory = manifestData.mandatory ?? false;

      const releaseManifest: ReleaseManifest = {
        version,
        buildNumber,
        minSupportedVersion,
        apkUrl,
        sha256: checksum,
        checksum,
        fileSize,
        releaseNotes,
        releasedAt,
        mandatory,
      };

      // Upsert into Prisma DB for persistent caching
      try {
        await this.prisma.appRelease.upsert({
          where: { version },
          update: {
            minSupportedVersion,
            apkUrl,
            checksum,
            releaseNotes,
            releasedAt,
          },
          create: {
            version,
            minSupportedVersion,
            apkUrl,
            checksum,
            releaseNotes,
            releasedAt,
          },
        });
        this.logger.log(`Successfully synced release v${version} into database.`);
      } catch (dbErr) {
        this.logger.warn(`Could not persist synced release to DB: ${dbErr}`);
      }

      this.cachedGithubRelease = releaseManifest;
      this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;
      return releaseManifest;
    } catch (err) {
      this.logger.warn(`GitHub Releases auto-sync error: ${err}`);
      return null;
    }
  }

  /**
   * Retrieves the authoritative latest release manifest.
   * If [currentVersion] is supplied, evaluates if client is already up-to-date.
   */
  async getLatestRelease(currentVersion?: string): Promise<ReleaseManifest> {
    // 1. Check if DB has a release
    let dbRelease: any = null;
    try {
      dbRelease = await this.prisma.appRelease.findFirst({
        orderBy: { releasedAt: 'desc' },
      });
    } catch (e) {
      this.logger.warn(`Error querying database for app release: ${e}`);
    }

    // 2. In normal runtime (or when explicitly enabled in tests), sync from GitHub if no DB release or cache expired
    const shouldSyncGithub =
      process.env.NODE_ENV !== 'test' || process.env.ENABLE_GITHUB_SYNC === 'true';

    let latestManifest: ReleaseManifest | null = null;

    if (dbRelease) {
      latestManifest = {
        version: dbRelease.version,
        buildNumber: 2,
        minSupportedVersion: dbRelease.minSupportedVersion,
        apkUrl: dbRelease.apkUrl,
        sha256: dbRelease.checksum,
        checksum: dbRelease.checksum,
        releaseNotes: dbRelease.releaseNotes,
        releasedAt: dbRelease.releasedAt,
        mandatory: false,
      };
    }

    // Check GitHub if DB is empty or cache expired
    if (shouldSyncGithub && (!latestManifest || Date.now() > this.cacheExpiry)) {
      const ghRelease = await this.syncFromGitHub();
      if (ghRelease) {
        if (!latestManifest) {
          latestManifest = ghRelease;
        } else if (this.compareSemver(ghRelease.version, latestManifest.version) > 0) {
          latestManifest = ghRelease;
        }
      }
    }

    // 3. If still no release found anywhere:
    if (!latestManifest) {
      if (currentVersion) {
        // If client reported its version, reassure client that it's up to date
        return {
          version: currentVersion,
          buildNumber: 1,
          minSupportedVersion: '1.0.0',
          apkUrl: '',
          sha256: '',
          checksum: '',
          releaseNotes: 'You are on the latest available version.',
          releasedAt: new Date(),
          mandatory: false,
          isUpdateAvailable: false,
          isLatest: true,
          message: 'You are already up to date.',
          currentVersion,
        };
      }

      throw new NotFoundException({
        code: 'RELEASE_NOT_FOUND',
        message: 'No published application releases found.',
      });
    }

    // 4. If currentVersion is provided, compare versions
    if (currentVersion) {
      const cmp = this.compareSemver(latestManifest.version, currentVersion);
      const isUpdateAvailable = cmp > 0;
      const isLatest = cmp <= 0;
      return {
        ...latestManifest,
        isUpdateAvailable,
        isLatest,
        currentVersion,
        message: isLatest
          ? 'You are already up to date.'
          : `Update v${latestManifest.version} is available.`,
      };
    }

    return latestManifest;
  }

  /**
   * Dedicated update check comparing client version with latest release.
   */
  async checkUpdate(currentVersion?: string) {
    const release = await this.getLatestRelease(currentVersion);
    const clientVer = currentVersion || release.version;
    const isUpdateAvailable = this.compareSemver(release.version, clientVer) > 0;

    return {
      isUpdateAvailable,
      isLatest: !isUpdateAvailable,
      currentVersion: clientVer,
      latestVersion: release.version,
      release,
      message: isUpdateAvailable
        ? `Update v${release.version} is available.`
        : 'You are already up to date.',
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

