import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/scope/scope.types';
import { CurrentUser } from '../auth/current-user.decorator';
import type { ScopeContext } from '../common/scope/scope.types';

@Controller('v1/stats')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) { }

  @Get('progress')
  @Roles(
    UserRole.team_member,
    UserRole.cdc_secretary,
    UserRole.sda,
    UserRole.dc,
    UserRole.cg,
    UserRole.admin,
    UserRole.super_admin,
  )
  async getProgress(
    @CurrentUser() user: ScopeContext,
    @Query('areaType') areaType?: string,
    @Query('areaId') areaId?: string,
  ) {
    return this.statsService.getProgress(user, { areaType, areaId });
  }
}
