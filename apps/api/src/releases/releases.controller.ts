import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ReleasesService, LatestReleaseResponse } from './releases.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

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

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.super_admin)
  async createRelease(@Body() dto: CreateReleaseDto): Promise<LatestReleaseResponse> {
    return this.releasesService.createRelease(dto);
  }
}
