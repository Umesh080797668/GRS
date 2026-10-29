import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { UserRole } from '../common/scope/scope.types';
import type { ScopeContext } from '../common/scope/scope.types';
import { SyncService } from './sync.service';
import { SyncAreaDto } from './dto/sync-area.dto';

@ApiTags('sync')
@Controller('v1/sync')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('area')
  @Roles(
    UserRole.team_member,
    UserRole.cdc_secretary,
    UserRole.super_admin,
    UserRole.admin,
    UserRole.cg,
    UserRole.dc,
    UserRole.sda,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Download initial area data (paged, resumable, houses + own scope lookups)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paged households and active lookups returned',
  })
  async downloadArea(
    @CurrentUser() user: ScopeContext,
    @Query() query: SyncAreaDto,
  ) {
    return this.syncService.getAreaData(user, query.cursor, query.limit);
  }
}
