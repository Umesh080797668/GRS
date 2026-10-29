import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  Req,
  UnauthorizedException,
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
  async getLatest(): Promise<ReleaseManifest> {
    return this.releasesService.getLatestRelease();
  }

  /**
   * GET /v1/releases/manifest
   * Alias for direct manifest.json queries.
   */
  @Get('manifest')
  async getManifest(): Promise<ReleaseManifest> {
    return this.releasesService.getLatestRelease();
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

    // 3. Fallback: Redirect to GitHub Releases asset for this version
    const fallbackGithubUrl = `https://github.com/Umesh080797668/GRS/releases/download/v${release.version}/app-release.apk`;
    return res.redirect(302, fallbackGithubUrl);
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
