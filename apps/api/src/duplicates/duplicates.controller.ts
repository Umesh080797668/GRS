import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { UserRole } from '../common/scope/scope.types';
import type { ScopeContext } from '../common/scope/scope.types';
import { DuplicatesService } from './duplicates.service';
import {
  ConfirmDuplicateDto,
  DismissDuplicateDto,
  ListDuplicatesDto,
} from './dto/duplicate.dto';

@ApiTags('Duplicates')
@Controller('v1/duplicates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DuplicatesController {
  constructor(private readonly duplicatesService: DuplicatesService) { }

  @Get()
  @Roles(
    UserRole.cdc_secretary,
    UserRole.sda,
    UserRole.dc,
    UserRole.cg,
    UserRole.admin,
    UserRole.super_admin,
  )
  async listDuplicates(
    @CurrentUser() user: ScopeContext,
    @Query() query: ListDuplicatesDto,
  ) {
    return this.duplicatesService.listDuplicates(user, query);
  }

  @Post(':id/confirm')
  @Roles(UserRole.cdc_secretary, UserRole.super_admin)
  async confirmDuplicate(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmDuplicateDto,
  ) {
    return this.duplicatesService.confirmDuplicate(user, id, dto);
  }

  @Post(':id/dismiss')
  @Roles(UserRole.cdc_secretary, UserRole.super_admin)
  async dismissDuplicate(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DismissDuplicateDto,
  ) {
    return this.duplicatesService.dismissDuplicate(user, id, dto);
  }
}
