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
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/scope/scope.types';
import type { ScopeContext } from '../common/scope/scope.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { ImportService } from './import.service';
import { PreviewImportDto, ImportTemplateQueryDto } from './dto/import.dto';

const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];
const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
  'text/plain',
];

export const importMulterOptions = {
  limits: {
    fileSize: 4.5 * 1024 * 1024, // 4.5 MB upfront limit
    files: 1,
  },
  fileFilter: (_req: any, file: any, callback: any) => {
    if (!file) {
      return callback(
        new BadRequestException({
          code: 'FILE_REQUIRED',
          message: 'Spreadsheet or CSV file is required',
        }),
        false,
      );
    }
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return callback(
        new BadRequestException({
          code: 'INVALID_FILE_TYPE',
          message: `Only CSV and Excel spreadsheets (.csv, .xlsx, .xls) are permitted. Received: ${ext || 'none'}`,
        }),
        false,
      );
    }
    if (
      file.mimetype &&
      !ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())
    ) {
      return callback(
        new BadRequestException({
          code: 'INVALID_FILE_MIME_TYPE',
          message: `MIME type '${file.mimetype}' is not permitted for household imports.`,
        }),
        false,
      );
    }
    callback(null, true);
  },
};

@Controller('v1/imports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('preview')
  @Roles(UserRole.cdc_secretary, UserRole.admin, UserRole.super_admin)
  @UseInterceptors(FileInterceptor('file', importMulterOptions))
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
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.importService.confirmImport(user, id);
  }

  @Get('template')
  @Roles(UserRole.cdc_secretary, UserRole.admin, UserRole.super_admin)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="grs_household_import_template.csv"',
  )
  getTemplate(@Query() query: ImportTemplateQueryDto) {
    return this.importService.getTemplateCsv(query.lang);
  }

  @Get(':id')
  @Roles(UserRole.cdc_secretary, UserRole.admin, UserRole.super_admin)
  async getImportBatch(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.importService.getImportBatch(user, id);
  }

  @Get(':id/errors')
  @Roles(UserRole.cdc_secretary, UserRole.admin, UserRole.super_admin)
  async downloadErrorReport(
    @CurrentUser() user: ScopeContext,
    @Param('id', ParseUUIDPipe) id: string,
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
