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
import { ClientService } from './client.service';
import {
  CreateClientDto,
  UpdateClientDto,
  ListClientsDto,
  DeleteClientDto,
} from './dto/client.dto';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('v1/clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientController {
  constructor(private readonly clientService: ClientService) { }

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
  async getClients(
    @CurrentUser() user: ScopeContext,
    @Query() query: ListClientsDto,
  ) {
    return this.clientService.getClients(user, query);
  }

  @Post()
  @Roles(
    UserRole.team_member,
    UserRole.cdc_secretary,
    UserRole.sda,
    UserRole.dc,
    UserRole.cg,
    UserRole.admin,
    UserRole.super_admin,
  )
  async createClient(
    @CurrentUser() user: ScopeContext,
    @Body() dto: CreateClientDto,
  ) {
    return this.clientService.createClient(user, dto);
  }

  @Patch(':id')
  @Roles(UserRole.cdc_secretary, UserRole.super_admin)
  async updateClient(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientService.updateClient(user, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.cdc_secretary, UserRole.super_admin)
  async deleteClient(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto?: DeleteClientDto,
  ) {
    return this.clientService.deleteClient(user, id, dto);
  }
}
