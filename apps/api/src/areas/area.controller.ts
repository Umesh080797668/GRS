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
  CreateTeamDto,
  UpdateTeamDto,
  ImportPilotAreaCsvDto,
} from './dto/area.dto';

@Controller('v1/areas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AreaController {
  constructor(private readonly areaService: AreaService) {}

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
  async getDs(@Query('districtId') districtId?: string) {
    return this.areaService.getDivisionalSecretariats(districtId);
  }

  @Post('gn')
  @Roles(UserRole.super_admin)
  async createGn(@Body() dto: CreateGnDto) {
    return this.areaService.createGnDivision(dto);
  }

  @Get('gn')
  async getGn(@Query('dsId') dsId?: string) {
    return this.areaService.getGnDivisions(dsId);
  }

  @Post('teams')
  @Roles(UserRole.super_admin)
  async createTeam(@Body() dto: CreateTeamDto) {
    return this.areaService.createTeam(dto);
  }

  @Get('teams')
  async getTeams(@Query('gnId') gnId?: string) {
    return this.areaService.getTeams(gnId);
  }

  @Patch('teams/:id')
  @Roles(UserRole.super_admin)
  async updateTeam(@Param('id') teamId: string, @Body() dto: UpdateTeamDto) {
    return this.areaService.updateTeam(teamId, dto);
  }

  @Post('import-csv')
  @Roles(UserRole.super_admin)
  async importPilotArea(@Body() dto: ImportPilotAreaCsvDto) {
    return this.areaService.importPilotAreaFromCsv(dto.csvContent);
  }
}
