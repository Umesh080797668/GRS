import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Header,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/scope/scope.types';
import type { ScopeContext } from '../common/scope/scope.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { ImportService } from './import.service';
import { PreviewImportDto, ImportTemplateQueryDto } from './dto/import.dto';

@Controller('v1/imports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) { }

  @Post('preview')
  @Roles(UserRole.cdc_secretary, UserRole.admin, UserRole.super_admin)
  @UseInterceptors(FileInterceptor('file'))
  async previewImport(
    @CurrentUser() user: ScopeContext,
    @Body() dto: PreviewImportDto,
    @UploadedFile() file: any,
  ) {
    return this.importService.previewImport(user, dto.gnId, file);
  }

  @Post(':id/confirm')
  @Roles(UserRole.cdc_secretary, UserRole.admin, UserRole.super_admin)
  async confirmImport(
    @CurrentUser() user: ScopeContext,
    @Param('id') id: string,
  ) {
    return this.importService.confirmImport(user, id);
  }

  @Get('template')
  @Roles(UserRole.cdc_secretary, UserRole.admin, UserRole.super_admin)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="grs_household_import_template.csv"')
  getTemplate(@Query() query: ImportTemplateQueryDto) {
    return this.importService.getTemplateCsv(query.lang);
  }

  @Get(':id')
  @Roles(UserRole.cdc_secretary, UserRole.admin, UserRole.super_admin)
  async getImportBatch(
    @CurrentUser() user: ScopeContext,
    @Param('id') id: string,
  ) {
    return this.importService.getImportBatch(user, id);
  }

  @Get(':id/errors')
  @Roles(UserRole.cdc_secretary, UserRole.admin, UserRole.super_admin)
  async downloadErrorReport(
    @CurrentUser() user: ScopeContext,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const csv = await this.importService.getErrorReportCsv(user, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="household_import_errors_${id}.csv"`,
    );
    res.send(csv);
  }
}
