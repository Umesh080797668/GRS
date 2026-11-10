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
  Header,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { UserRole } from '../common/scope/scope.types';
import type { ScopeContext } from '../common/scope/scope.types';
import { AccountService } from './account.service';
import { AssignmentService } from './assignment.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { CreateBulkAccountsDto } from './dto/create-bulk-accounts.dto';
import { ListAccountsDto } from './dto/list-accounts.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AssignAccountDto } from './dto/assign-account.dto';
import { TransferAccountDto } from './dto/transfer-account.dto';
import { ListAssignmentsDto } from './dto/list-assignments.dto';

@Controller('v1/accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccountController {
  constructor(
    private readonly accountService: AccountService,
    private readonly assignmentService: AssignmentService,
  ) { }

  @Post()
  @Header('Cache-Control', 'no-store')
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
  @Header('Cache-Control', 'no-store')
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
    @Param('id', ParseUUIDPipe) targetId: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountService.updateAccount(user, targetId, dto);
  }

  @Patch(':id/deactivate')
  @Roles(
    UserRole.super_admin,
    UserRole.admin,
    UserRole.cg,
    UserRole.dc,
    UserRole.sda,
    UserRole.cdc_secretary,
  )
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivateAccount(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) targetId: string,
  ) {
    await this.accountService.deactivateAccount(user, targetId);
  }

  @Patch(':id/reactivate')
  @Roles(
    UserRole.super_admin,
    UserRole.admin,
    UserRole.cg,
    UserRole.dc,
    UserRole.sda,
    UserRole.cdc_secretary,
  )
  @HttpCode(HttpStatus.NO_CONTENT)
  async reactivateAccount(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) targetId: string,
  ) {
    await this.accountService.reactivateAccount(user, targetId);
  }

  @Post(':id/reissue-password')
  @Header('Cache-Control', 'no-store')
  @Roles(
    UserRole.super_admin,
    UserRole.admin,
    UserRole.cg,
    UserRole.dc,
    UserRole.sda,
    UserRole.cdc_secretary,
  )
  async reissuePassword(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) targetId: string,
  ) {
    return this.accountService.reissuePassword(user, targetId);
  }

  @Post(':id/reset-password')
  @Header('Cache-Control', 'no-store')
  @Roles(
    UserRole.super_admin,
    UserRole.admin,
    UserRole.cg,
    UserRole.dc,
    UserRole.sda,
    UserRole.cdc_secretary,
  )
  async resetPassword(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) targetId: string,
  ) {
    return this.accountService.resetPassword(user, targetId);
  }

  @Post('batches/:id/reissue')
  @Header('Cache-Control', 'no-store')
  @Roles(
    UserRole.super_admin,
    UserRole.admin,
    UserRole.cg,
    UserRole.dc,
    UserRole.sda,
    UserRole.cdc_secretary,
  )
  async reissueBatch(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) batchId: string,
  ) {
    return this.accountService.reissueBatch(user, batchId);
  }

  // ── Assignment endpoints ────────────────────────────────────────────────────

  /**
   * GET /v1/accounts/assignments
   * Lists active assignments within the caller's scope.
   */
  @Get('assignments')
  @Roles(
    UserRole.super_admin,
    UserRole.admin,
    UserRole.cg,
    UserRole.dc,
    UserRole.sda,
  )
  async listAssignments(
    @CurrentUser() user: ScopeContext,
    @Query() query: ListAssignmentsDto,
  ) {
    return this.assignmentService.listActive(user, query);
  }

  /**
   * GET /v1/accounts/:id/assignments
   * Full assignment history for a single profile.
   */
  @Get(':id/assignments')
  @Roles(
    UserRole.super_admin,
    UserRole.admin,
    UserRole.cg,
    UserRole.dc,
    UserRole.sda,
  )
  async getProfileAssignments(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) profileId: string,
  ) {
    return this.assignmentService.getForProfile(user, profileId);
  }

  /**
   * POST /v1/accounts/:id/assign
   * Assigns territory to an account. Ends any existing open assignment first.
   */
  @Post(':id/assign')
  @Header('Cache-Control', 'no-store')
  @Roles(
    UserRole.super_admin,
    UserRole.admin,
    UserRole.cg,
    UserRole.dc,
    UserRole.sda,
  )
  async assignAccount(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) profileId: string,
    @Body() dto: AssignAccountDto,
  ) {
    return this.assignmentService.assign(user, profileId, dto);
  }

  /**
   * POST /v1/accounts/:id/end-assignment
   * Ends the open assignment for a profile. Clears cache columns (fail-closed).
   */
  @Post(':id/end-assignment')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  @Roles(
    UserRole.super_admin,
    UserRole.admin,
    UserRole.cg,
    UserRole.dc,
    UserRole.sda,
  )
  async endAssignment(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) profileId: string,
  ) {
    return this.assignmentService.endAssignment(user, profileId);
  }

  /**
   * POST /v1/accounts/:id/transfer
   * Transfers the current assignment from :id to another profile.
   */
  @Post(':id/transfer')
  @Header('Cache-Control', 'no-store')
  @Roles(
    UserRole.super_admin,
    UserRole.admin,
    UserRole.cg,
    UserRole.dc,
    UserRole.sda,
  )
  async transferAssignment(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) fromProfileId: string,
    @Body() dto: TransferAccountDto,
  ) {
    return this.assignmentService.transfer(user, fromProfileId, dto);
  }
}
