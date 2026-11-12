import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { ScopeContext } from '../common/scope/scope.types';
import { UserRole } from '../common/scope/scope.types';
import {
  CreateExportBodyDto,
  ListExportsQueryDto,
  ReportPreviewQueryDto,
} from './dto/export.dto';
import { ExportJobService } from './export-job.service';

@Controller('v1/exports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExportController {
  constructor(private readonly exportJobService: ExportJobService) { }

  @Post()
  @Roles(
    UserRole.cdc_secretary,
    UserRole.sda,
    UserRole.dc,
    UserRole.cg,
    UserRole.admin,
    UserRole.super_admin,
  )
  async createExport(
    @CurrentUser() caller: ScopeContext,
    @Body() body: CreateExportBodyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.exportJobService.createExportForCaller(
      caller,
      body,
    );
    if (result.status === 'queued' || result.status === 'running') {
      res.status(HttpStatus.ACCEPTED);
    } else {
      res.status(HttpStatus.CREATED);
    }
    return result;
  }

  @Get('preview')
  @Roles(
    UserRole.cdc_secretary,
    UserRole.sda,
    UserRole.dc,
    UserRole.cg,
    UserRole.admin,
    UserRole.super_admin,
  )
  async getReportPreview(
    @CurrentUser() caller: ScopeContext,
    @Query() query: ReportPreviewQueryDto,
  ) {
    return this.exportJobService.getReportPreview(caller, query);
  }

  @Get()
  @Roles(
    UserRole.cdc_secretary,
    UserRole.sda,
    UserRole.dc,
    UserRole.cg,
    UserRole.admin,
    UserRole.super_admin,
  )
  async listExports(
    @CurrentUser() caller: ScopeContext,
    @Query() query: ListExportsQueryDto,
  ) {
    return this.exportJobService.listExportsForCaller(caller, query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(
    UserRole.cdc_secretary,
    UserRole.sda,
    UserRole.dc,
    UserRole.cg,
    UserRole.admin,
    UserRole.super_admin,
  )
  async getExport(
    @CurrentUser() caller: ScopeContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.exportJobService.getExportJobForCaller(caller, id);
  }
}
