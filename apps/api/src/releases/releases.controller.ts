import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  Req,
  Query,
  Headers,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { ReleasesService } from './releases.service';
import { ReleaseManifest } from './release-manifest.interface';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import * as fs from 'fs';
import * as path from 'path';

export class CreateReleaseDto {
  @IsString()
  @IsNotEmpty()
  version: string;

  @IsString()
  @IsNotEmpty()
  minSupportedVersion: string;

  @IsString()
  @IsNotEmpty()
  apkUrl: string;

  @IsString()
  @IsOptional()
  checksum?: string;

  @IsString()
  @IsOptional()
  sha256?: string;

  @IsString()
  @IsOptional()
  releaseNotes?: string;

  @IsNumber()
  @IsOptional()
  buildNumber?: number;

  @IsNumber()
  @IsOptional()
  fileSize?: number;

  @IsBoolean()
  @IsOptional()
  mandatory?: boolean;
}

@Controller('v1/releases')
export class ReleasesController {
  constructor(private readonly releasesService: ReleasesService) { }

  /**
   * GET /v1/releases/latest
   * Returns authoritative release manifest JSON.
   */
  @Get('latest')
  async getLatest(
    @Query('current_version') queryVersion?: string,
    @Headers('x-app-version') headerVersion?: string,
  ): Promise<ReleaseManifest> {
    const currentVersion = queryVersion || headerVersion;
    return this.releasesService.getLatestRelease(currentVersion);
  }

  /**
   * GET /v1/releases/manifest
   * Alias for direct manifest.json queries.
   */
  @Get('manifest')
  async getManifest(
    @Query('current_version') queryVersion?: string,
    @Headers('x-app-version') headerVersion?: string,
  ): Promise<ReleaseManifest> {
    const currentVersion = queryVersion || headerVersion;
    return this.releasesService.getLatestRelease(currentVersion);
  }

  /**
   * GET /v1/releases/check
   * Explicit update check endpoint comparing client version with latest release.
   */
  @Get('check')
  async checkUpdate(
    @Query('current_version') queryVersion?: string,
    @Headers('x-app-version') headerVersion?: string,
  ) {
    const currentVersion = queryVersion || headerVersion;
    return this.releasesService.checkUpdate(currentVersion);
  }

  /**
   * POST /v1/releases/sync
   * Manually trigger GitHub releases sync.
   */
  @Post('sync')
  async syncReleases(
    @Req() req: Request,
  ): Promise<{ message: string; release: ReleaseManifest | null }> {
    const releaseSecret = process.env.RELEASE_SECRET;
    const providedSecret = req.headers['x-release-secret'];
    const authHeader = req.headers.authorization;

    if ((releaseSecret && providedSecret === releaseSecret) || authHeader) {
      const release = await this.releasesService.syncFromGitHub();
      return {
        message: release
          ? `Synced latest release v${release.version}`
          : 'No release found on GitHub or sync failed',
        release,
      };
    }

    throw new UnauthorizedException({
      code: 'UNAUTHORIZED',
      message: 'Missing authorization or release secret',
    });
  }


  /**
   * GET /v1/releases/download
   * Redirects (302) to GitHub Releases asset for Vercel/cloud hosting,
   * or streams local file if present on disk for local/docker setups.
   */
  @Get('download')
  async downloadApk(@Res() res: Response) {
    const release = await this.releasesService.getLatestRelease();

    // 1. If apkUrl is a full external URL (e.g. GitHub Releases CDN), redirect 302
    // Prevents hitting Vercel's 4.5MB serverless payload limit
    if (
      release.apkUrl &&
      (release.apkUrl.startsWith('http://') ||
        release.apkUrl.startsWith('https://'))
    ) {
      return res.redirect(302, release.apkUrl);
    }

    // 2. Check candidate local disk paths (for local development or Docker)
    const candidatePaths = [
      path.join(process.cwd(), 'public/releases/app-release.apk'),
      path.join(__dirname, '../../public/releases/app-release.apk'),
      path.join(
        process.cwd(),
        '../mobile/build/app/outputs/flutter-apk/app-release.apk',
      ),
      path.join(
        __dirname,
        '../../../../mobile/build/app/outputs/flutter-apk/app-release.apk',
      ),
    ];

    for (const candidate of candidatePaths) {
      if (fs.existsSync(candidate)) {
        res.setHeader(
          'Content-Type',
          'application/vnd.android.package-archive',
        );
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="grs-mobile.apk"',
        );
        return res.sendFile(candidate);
      }
    }

    // 3. Binary not found locally or externally
    throw new NotFoundException({
      code: 'RELEASE_NOT_FOUND',
      message: 'APK release binary is not available on this server.',
    });
  }

  /**
   * POST /v1/releases
   * Publish new application release manifest.
   * Can be invoked by Super Admin or CI via X-Release-Secret header.
   */
  @Post()
  async createRelease(
    @Body() dto: CreateReleaseDto,
    @Req() req: Request,
  ): Promise<ReleaseManifest> {
    const releaseSecret = process.env.RELEASE_SECRET;
    const providedSecret = req.headers['x-release-secret'];

    if (releaseSecret && providedSecret === releaseSecret) {
      // Authenticated via CI webhook secret
      return this.releasesService.createRelease(dto);
    }

    // Otherwise enforce JWT Super Admin guard manually or via delegate
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing authorization or release secret',
      });
    }

    return this.releasesService.createRelease(dto);
  }
}
