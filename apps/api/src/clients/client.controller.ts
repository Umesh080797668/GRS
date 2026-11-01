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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { UserRole, ScopeContext } from '../common/scope/scope.types';
import { ClientService } from './client.service';
import {
  CreateClientDto,
  UpdateClientDto,
  ListClientsDto,
} from './dto/client.dto';

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
  @Roles(UserRole.team_member, UserRole.cdc_secretary, UserRole.super_admin)
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
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientService.updateClient(user, id, dto);
  }
}
