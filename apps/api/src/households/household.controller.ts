import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/scope/scope.types';
import type { ScopeContext } from '../common/scope/scope.types';
import { HouseholdService } from './household.service';
import {
  CreateHouseholdDto,
  UpdateHouseholdDto,
  DeleteHouseholdDto,
  ListHouseholdsDto,
} from './dto/household.dto';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('v1/houses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HouseholdController {
  constructor(private readonly householdService: HouseholdService) { }

  @Get()
  @Roles(
    UserRole.team_member,
    UserRole.cdc_secretary,
    UserRole.sda,
    UserRole.dc,
    UserRole.cg,
    UserRole.admin,
    UserRole.super_admin,
  )
  async getHouseholds(
    @CurrentUser() user: ScopeContext,
    @Query() query: ListHouseholdsDto,
  ) {
    return this.householdService.getHouseholds(user, query);
  }

  @Get(':id')
  @Roles(
    UserRole.team_member,
    UserRole.cdc_secretary,
    UserRole.sda,
    UserRole.dc,
    UserRole.cg,
    UserRole.admin,
    UserRole.super_admin,
  )
  async getHouseholdById(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.householdService.getHouseholdById(user, id);
  }

  @Post()
  @Roles(UserRole.cdc_secretary, UserRole.super_admin)
  async createHousehold(
    @CurrentUser() user: ScopeContext,
    @Body() dto: CreateHouseholdDto,
  ) {
    return this.householdService.createHousehold(user, dto);
  }

  @Patch(':id')
  @Roles(UserRole.cdc_secretary, UserRole.super_admin)
  async updateHousehold(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHouseholdDto,
  ) {
    return this.householdService.updateHousehold(user, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.cdc_secretary, UserRole.super_admin)
  async deleteHousehold(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto?: DeleteHouseholdDto,
  ) {
    return this.householdService.deleteHousehold(user, id, dto);
  }

  @Post(':id/finish')
  @Roles(UserRole.team_member, UserRole.cdc_secretary, UserRole.super_admin)
  async finishHousehold(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.householdService.finishHousehold(user, id);
  }

  @Post(':id/reopen')
  @Roles(
    UserRole.cdc_secretary,
    UserRole.sda,
    UserRole.dc,
    UserRole.cg,
    UserRole.admin,
    UserRole.super_admin,
  )
  async reopenHousehold(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.householdService.reopenHousehold(user, id);
  }
}
