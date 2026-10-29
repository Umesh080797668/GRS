import { Controller, Get, Post, Body, Res, UseGuards, NotFoundException } from '@nestjs/common';
import { ReleasesService, LatestReleaseResponse } from './releases.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
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
  @IsNotEmpty()
  checksum: string;

  @IsString()
  @IsOptional()
  releaseNotes?: string;
}

@Controller('v1/releases')
export class ReleasesController {
  constructor(private readonly releasesService: ReleasesService) { }

  @Get('latest')
  async getLatest(): Promise<LatestReleaseResponse> {
    return this.releasesService.getLatestRelease();
  }

  @Get('download')
  async downloadApk(@Res() res: any) {
    const candidatePaths = [
      path.join(process.cwd(), 'public/releases/app-release.apk'),
      path.join(__dirname, '../../public/releases/app-release.apk'),
      path.join(process.cwd(), '../mobile/build/app/outputs/flutter-apk/app-release.apk'),
      path.join(__dirname, '../../../../mobile/build/app/outputs/flutter-apk/app-release.apk'),
    ];

    for (const candidate of candidatePaths) {
      if (fs.existsSync(candidate)) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', 'attachment; filename="grs-mobile.apk"');
        return res.sendFile(candidate);
      }
    }

    throw new NotFoundException({
      code: 'RELEASE_NOT_FOUND',
      message: 'APK release binary is not available on this server.',
    });
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.super_admin)
  async createRelease(@Body() dto: CreateReleaseDto): Promise<LatestReleaseResponse> {
    return this.releasesService.createRelease(dto);
  }
}
