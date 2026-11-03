import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AreaService } from './area.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/scope/scope.types';
import {
  CreateDsDto,
  CreateGnDto,
  UpdateGnDto,
  CreateTeamDto,
  UpdateTeamDto,
  ImportPilotAreaCsvDto,
  ListDsDto,
  ListGnDto,
  ListTeamsDto,
} from './dto/area.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { ScopeContext } from '../common/scope/scope.types';

@Controller('v1/areas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AreaController {
  constructor(private readonly areaService: AreaService) { }

  @Get('districts')
  async getDistricts() {
    return this.areaService.getDistricts();
  }

  @Get('districts/:id')
  async getDistrictById(@Param('id') id: string) {
    return this.areaService.getDistrictById(id);
  }

  @Post('districts/seed')
  @Roles(UserRole.super_admin)
  async seedDistricts() {
    const seeded = await this.areaService.seedDistricts();
    return { message: 'Districts seeded successfully', count: seeded };
  }

  @Post('ds')
  @Roles(UserRole.super_admin)
  async createDs(@Body() dto: CreateDsDto) {
    return this.areaService.createDivisionalSecretariat(dto);
  }

  @Get('ds')
  @Roles(
    UserRole.super_admin,
    UserRole.admin,
    UserRole.cg,
    UserRole.dc,
    UserRole.sda,
    UserRole.cdc_secretary,
    UserRole.team_member,
  )
  async getDs(
    @CurrentUser() user: ScopeContext,
    @Query() query: ListDsDto,
  ) {
    return this.areaService.getDivisionalSecretariats(user, query);
  }

  @Post('gn')
  @Roles(UserRole.super_admin)
  async createGn(@Body() dto: CreateGnDto) {
    return this.areaService.createGnDivision(dto);
  }

  @Get('gn')
  @Roles(
    UserRole.super_admin,
    UserRole.admin,
    UserRole.cg,
    UserRole.dc,
    UserRole.sda,
    UserRole.cdc_secretary,
    UserRole.team_member,
  )
  async getGn(
    @CurrentUser() user: ScopeContext,
    @Query() query: ListGnDto,
  ) {
    return this.areaService.getGnDivisions(user, query);
  }

  @Get('gn/:id')
  @Roles(
    UserRole.team_member,
    UserRole.cdc_secretary,
    UserRole.sda,
    UserRole.dc,
    UserRole.cg,
    UserRole.admin,
    UserRole.super_admin,
  )
  async getGnById(@CurrentUser() user: ScopeContext, @Param('id') id: string) {
    return this.areaService.getGnDivisionById(user, id);
  }

  @Patch('gn/:id')
  @Roles(UserRole.cdc_secretary, UserRole.super_admin)
  async updateGn(
    @CurrentUser() user: ScopeContext,
    @Param('id') id: string,
    @Body() dto: UpdateGnDto,
  ) {
    return this.areaService.updateGnDivision(user, id, dto);
  }

  @Post('teams')
  @Roles(UserRole.super_admin)
  async createTeam(@Body() dto: CreateTeamDto) {
    return this.areaService.createTeam(dto);
  }

  @Get('teams')
  @Roles(
    UserRole.super_admin,
    UserRole.admin,
    UserRole.cg,
    UserRole.dc,
    UserRole.sda,
    UserRole.cdc_secretary,
  )
  async getTeams(
    @CurrentUser() user: ScopeContext,
    @Query() query: ListTeamsDto,
  ) {
    return this.areaService.getTeams(user, query);
  }

  @Patch('teams/:id')
  @Roles(UserRole.super_admin)
  async updateTeam(@Param('id') teamId: string, @Body() dto: UpdateTeamDto) {
    return this.areaService.updateTeam(teamId, dto);
  }

  @Post('import-csv')
  @Roles(UserRole.super_admin)
  async importPilotArea(@Body() dto: ImportPilotAreaCsvDto) {
    return this.areaService.importPilotAreaFromCsv(dto.csvContent, dto.dryRun);
  }
}
