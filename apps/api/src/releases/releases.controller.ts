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
  ForbiddenException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { ReleasesService } from './releases.service';
import { ReleaseManifest } from './release-manifest.interface';
import { PrismaService } from '../prisma/prisma.service';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  Matches,
} from 'class-validator';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../common/scope/scope.types';

export class CreateReleaseDto {
  @IsString()
  @IsNotEmpty()
  version: string;

  @IsString()
  @IsNotEmpty()
  minSupportedVersion: string;

  @IsString()
  @IsNotEmpty()
  @Matches(
    /^(https:\/\/github\.com\/Umesh080797668\/GRS\/releases\/download\/.*|https:\/\/objects\.githubusercontent\.com\/.*|\/v1\/releases\/download(\?.*)?)$/,
    {
      message:
        'apkUrl must point to an official GitHub release under /Umesh080797668/GRS/releases/download/, objects.githubusercontent.com, or local download endpoint (/v1/releases/download)',
    },
  )
  apkUrl: string;

  @IsString()
  @IsOptional()
  @Matches(/^[a-fA-F0-9]{64}$/, {
    message: 'checksum must be a valid 64-character SHA-256 hexadecimal string',
  })
  checksum?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[a-fA-F0-9]{64}$/, {
    message: 'sha256 must be a valid 64-character SHA-256 hexadecimal string',
  })
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
  private readonly fallbackJwtService = new JwtService();

  constructor(
    private readonly releasesService: ReleasesService,
    private readonly prisma: PrismaService,
    @Optional() private readonly jwtService?: JwtService,
  ) { }

  /**
   * Validates that the request comes from an authorized publisher:
   * 1. CI automation providing matching non-empty X-Release-Secret header, OR
   * 2. Authenticated user with super_admin role via valid JWT Bearer token.
   */
  private async verifyPublisher(req: Request): Promise<void> {
    const releaseSecret = process.env.RELEASE_SECRET;
    const providedSecret = req.headers['x-release-secret'];

    // 1. CI secret check: RELEASE_SECRET must be set, non-empty, and match constant-time
    if (
      releaseSecret &&
      releaseSecret.trim().length > 0 &&
      providedSecret &&
      typeof providedSecret === 'string'
    ) {
      const sBuf = Buffer.from(releaseSecret);
      const pBuf = Buffer.from(providedSecret);
      if (sBuf.length === pBuf.length && crypto.timingSafeEqual(sBuf, pBuf)) {
        return;
      }
    }

    // 2. JWT authorization check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing authorization or valid release secret',
      });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing bearer token',
      });
    }

    let payload: any;
    try {
      const jwtSecret = process.env.JWT_ACCESS_SECRET;
      const verifier = this.jwtService || this.fallbackJwtService;
      payload = verifier.verify(token, { secret: jwtSecret });
    } catch {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired authorization token',
      });
    }

    if (
      !payload ||
      payload.role !== UserRole.super_admin ||
      payload.scope !== 'full'
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_SCOPE',
        message: 'Only super_admin with full scope can publish or sync app releases',
      });
    }

    if (this.prisma && this.prisma.profile) {
      const profile = await this.prisma.profile.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          role: true,
          isActive: true,
          tokenVersion: true,
        },
      });

      if (!profile || !profile.isActive) {
        throw new UnauthorizedException({
          code: 'ACCOUNT_DEACTIVATED',
          message_key: 'errors.auth.deactivated',
          message: 'Account is deactivated',
        });
      }

      if (profile.tokenVersion !== payload.tokenVersion) {
        throw new UnauthorizedException({
          code: 'AUTH_INVALID',
          message_key: 'errors.auth.session_revoked',
          message: 'Session has been revoked',
        });
      }

      if (profile.role !== UserRole.super_admin) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_SCOPE',
          message: 'Only super_admin can publish or sync app releases',
        });
      }
    }

    (req as any).user = payload;
  }

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
   * Can be invoked by Super Admin or CI via X-Release-Secret header.
   */
  @Post('sync')
  async syncReleases(
    @Req() req: Request,
  ): Promise<{ message: string; release: ReleaseManifest | null }> {
    await this.verifyPublisher(req);

    const release = await this.releasesService.syncFromGitHub();
    return {
      message: release
        ? `Synced latest release v${release.version}`
        : 'No release found on GitHub or sync failed',
      release,
    };
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
    await this.verifyPublisher(req);

    return this.releasesService.createRelease(dto);
  }
}
