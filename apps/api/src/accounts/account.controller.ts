import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { UserRole } from '../common/scope/scope.types';
import type { ScopeContext } from '../common/scope/scope.types';
import { AccountService } from './account.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { CreateBulkAccountsDto } from './dto/create-bulk-accounts.dto';
import { ListAccountsDto } from './dto/list-accounts.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Controller('v1/accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post()
  @Roles(
    UserRole.super_admin,
    UserRole.cg,
    UserRole.dc,
    UserRole.sda,
    UserRole.cdc_secretary,
  )
  async createAccount(
    @CurrentUser() user: ScopeContext,
    @Body() dto: CreateAccountDto,
  ) {
    return this.accountService.createAccount(user, dto);
  }

  @Post('bulk')
  @Roles(
    UserRole.super_admin,
    UserRole.cg,
    UserRole.dc,
    UserRole.sda,
    UserRole.cdc_secretary,
  )
  async createBulkAccounts(
    @CurrentUser() user: ScopeContext,
    @Body() dto: CreateBulkAccountsDto,
  ) {
    return this.accountService.createBulkAccounts(user, dto);
  }

  @Get()
  @Roles(
    UserRole.super_admin,
    UserRole.admin,
    UserRole.cg,
    UserRole.dc,
    UserRole.sda,
    UserRole.cdc_secretary,
  )
  async listAccounts(
    @CurrentUser() user: ScopeContext,
    @Query() query: ListAccountsDto,
  ) {
    return this.accountService.findAccounts(user, query);
  }

  @Patch(':id')
  @Roles(
    UserRole.super_admin,
    UserRole.cg,
    UserRole.dc,
    UserRole.sda,
    UserRole.cdc_secretary,
  )
  async updateAccount(
    @CurrentUser() user: ScopeContext,
    @Param('id') targetId: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountService.updateAccount(user, targetId, dto);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.super_admin, UserRole.cdc_secretary)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivateAccount(
    @CurrentUser() user: ScopeContext,
    @Param('id') targetId: string,
  ) {
    await this.accountService.deactivateAccount(user, targetId);
  }

  @Patch(':id/reactivate')
  @Roles(UserRole.super_admin, UserRole.cdc_secretary)
  @HttpCode(HttpStatus.NO_CONTENT)
  async reactivateAccount(
    @CurrentUser() user: ScopeContext,
    @Param('id') targetId: string,
  ) {
    await this.accountService.reactivateAccount(user, targetId);
  }

  @Post(':id/reissue-password')
  @Roles(UserRole.super_admin, UserRole.cdc_secretary)
  async reissuePassword(
    @CurrentUser() user: ScopeContext,
    @Param('id') targetId: string,
  ) {
    return this.accountService.reissuePassword(user, targetId);
  }

  @Post(':id/reset-password')
  @Roles(UserRole.super_admin, UserRole.cdc_secretary)
  async resetPassword(
    @CurrentUser() user: ScopeContext,
    @Param('id') targetId: string,
  ) {
    return this.accountService.resetPassword(user, targetId);
  }

  @Post('batches/:id/reissue')
  @Roles(UserRole.super_admin, UserRole.cdc_secretary)
  async reissueBatch(
    @CurrentUser() user: ScopeContext,
    @Param('id') batchId: string,
  ) {
    return this.accountService.reissueBatch(user, batchId);
  }
}
