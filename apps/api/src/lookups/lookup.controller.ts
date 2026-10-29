import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { LookupService } from './lookup.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/scope/scope.types';

@Controller('v1/lookups')
export class LookupController {
  constructor(private readonly lookupService: LookupService) { }

  @Get()
  async getLookups(
    @Query('category') category: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.lookupService.getCategorizedLookups(category);
    (res as any).setHeader('ETag', `"${data.version}"`);
    (res as any).setHeader('Cache-Control', 'public, max-age=3600');
    return data;
  }

  @Get('version')
  async getVersion() {
    return this.lookupService.getVersion();
  }

  @Post('seed')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.super_admin)
  async seedLookups() {
    const seeded = await this.lookupService.seed();
    return {
      message: 'Lookups seeded successfully',
      count: seeded,
    };
  }
}
