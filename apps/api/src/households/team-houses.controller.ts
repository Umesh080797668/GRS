import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { UserRole } from '../common/scope/scope.types';
import type { ScopeContext } from '../common/scope/scope.types';
import { HouseholdService } from './household.service';
import { AssignHousesDto } from './dto/household.dto';

@Controller('v1/teams')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeamHousesController {
  constructor(private readonly householdService: HouseholdService) {}

  @Post(':id/houses')
  @Roles(UserRole.sda, UserRole.cdc_secretary, UserRole.super_admin)
  async assignHousesToTeam(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) teamId: string,
    @Body() dto: AssignHousesDto,
  ) {
    return this.householdService.assignHousesToTeam(user, teamId, dto.houseIds);
  }

  @Delete(':id/houses/:houseId')
  @Roles(UserRole.sda, UserRole.cdc_secretary, UserRole.super_admin)
  async unassignHouseFromTeam(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) teamId: string,
    @Param('houseId', ParseUUIDPipe) houseId: string,
  ) {
    return this.householdService.unassignHouseFromTeam(user, teamId, houseId);
  }

  @Post(':id/houses/:houseId/reassign')
  @Roles(UserRole.super_admin)
  async reassignHouseToTeam(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) teamId: string,
    @Param('houseId', ParseUUIDPipe) houseId: string,
  ) {
    return this.householdService.reassignHouseToTeam(user, teamId, houseId);
  }
}
