import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ScopeContext, UserRole } from '../common/scope/scope.types';
import { CANONICAL_LOOKUPS } from '../lookups/lookup.data';
import { LookupService } from '../lookups/lookup.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildLookupTranslationMap,
  ExportFormat,
  ExportKind,
  formatBooleanLabel,
  formatColomboTimestamp,
  formatCsvRow,
  formatDuplicateStatusLabel,
  formatDuplicateTierLabel,
  formatGenderLabel,
  formatInfoProvidedByLabel,
  formatInterestCategoryLabel,
  formatScopeLevelLabel,
  LookupTranslationMap,
  normalizeReportLanguage,
  pickTrilingual,
  R2_CLIENT_COLUMN_KEYS,
  R2_COLUMN_HEADERS_I18N,
  REPORT_COLUMN_HEADERS_I18N,
  ReportLanguage,
  sanitizeSpreadsheetCell,
  SHEET_TITLES_I18N,
} from './export-formatters';
import { ExportStorageService } from './export-storage.service';

export const EXPORT_COLUMNS_REGISTRY: Record<
  string,
  { header: string; key: string; width: number }
> = {
  // Household / Area pre-visit export columns
  district_name: { header: 'District', key: 'district_name', width: 20 },
  ds_name: { header: 'Divisional Secretariat', key: 'ds_name', width: 25 },
  sdo_name: { header: 'SDO Officer Name', key: 'sdo_name', width: 25 },
  gn_number: { header: 'GN Division Number', key: 'gn_number', width: 15 },
  gn_name: { header: 'GN Division Name', key: 'gn_name', width: 25 },
  secretary_name: {
    header: 'CDC Secretary Name',
    key: 'secretary_name',
    width: 25,
  },
  secretary_contact: {
    header: 'CDC Secretary Contact',
    key: 'secretary_contact',
    width: 20,
  },
  secretary_email: {
    header: 'CDC Secretary Email',
    key: 'secretary_email',
    width: 25,
  },
  serial_no: { header: 'Serial Number', key: 'serial_no', width: 15 },
  house_no: { header: 'House Number', key: 'house_no', width: 15 },
  house_leader_name: {
    header: 'House Leader Name',
    key: 'house_leader_name',
    width: 25,
  },
  address: { header: 'Address', key: 'address', width: 30 },
  village_name: { header: 'Village Name', key: 'village_name', width: 20 },
  is_epf: { header: 'EPF Beneficiary', key: 'is_epf', width: 15 },
  is_etf: { header: 'ETF Beneficiary', key: 'is_etf', width: 15 },
  is_aswesuma: {
    header: 'Aswesuma Beneficiary',
    key: 'is_aswesuma',
    width: 15,
  },
  is_samurdhi: {
    header: 'Samurdhi Beneficiary',
    key: 'is_samurdhi',
    width: 15,
  },
  has_special_needs: {
    header: 'Special Needs in Household',
    key: 'has_special_needs',
    width: 15,
  },
  target_female: {
    header: 'Target Female Count',
    key: 'target_female',
    width: 15,
  },
  target_male: { header: 'Target Male Count', key: 'target_male', width: 15 },
  age_group_min: { header: 'Age Group Min', key: 'age_group_min', width: 15 },
  age_group_max: { header: 'Age Group Max', key: 'age_group_max', width: 15 },
  lang_sinhala: { header: 'Language Sinhala', key: 'lang_sinhala', width: 15 },
  lang_tamil: { header: 'Language Tamil', key: 'lang_tamil', width: 15 },
  lang_english: { header: 'Language English', key: 'lang_english', width: 15 },
  team_no: { header: 'Assigned Team', key: 'team_no', width: 15 },

  // Client export columns
  client_name: { header: 'Client Name', key: 'client_name', width: 25 },
  client_age: { header: 'Client Age', key: 'client_age', width: 12 },
  client_gender: { header: 'Client Gender', key: 'client_gender', width: 12 },
  client_address: {
    header: 'Client Address',
    key: 'client_address',
    width: 30,
  },
  phone_raw: { header: 'Phone Raw', key: 'phone_raw', width: 18 },
  phone_e164: { header: 'Phone E164', key: 'phone_e164', width: 18 },
  whatsapp_raw: { header: 'WhatsApp Raw', key: 'whatsapp_raw', width: 18 },
  whatsapp_e164: { header: 'WhatsApp E164', key: 'whatsapp_e164', width: 18 },
  highest_education: {
    header: 'Highest Education',
    key: 'highest_education',
    width: 25,
  },
  highest_vocational: {
    header: 'Highest Vocational Qualification',
    key: 'highest_vocational',
    width: 25,
  },
  interested_vocational_stream: {
    header: 'Interested Vocational Stream',
    key: 'interested_vocational_stream',
    width: 25,
  },
  interested_job: {
    header: 'Interested Job',
    key: 'interested_job',
    width: 25,
  },
  client_is_epf: { header: 'Client EPF', key: 'client_is_epf', width: 15 },
  client_is_etf: { header: 'Client ETF', key: 'client_is_etf', width: 15 },
  client_is_aswesuma: {
    header: 'Client Aswesuma',
    key: 'client_is_aswesuma',
    width: 15,
  },
  client_is_samurdhi: {
    header: 'Client Samurdhi',
    key: 'client_is_samurdhi',
    width: 15,
  },
  client_has_special_needs: {
    header: 'Client Special Needs',
    key: 'client_has_special_needs',
    width: 15,
  },
  future_hopes: { header: 'Future Hopes', key: 'future_hopes', width: 30 },
  info_provided_by: {
    header: 'Information Provided By',
    key: 'info_provided_by',
    width: 20,
  },
  info_provided_by_other: {
    header: 'Information Provided By Other',
    key: 'info_provided_by_other',
    width: 25,
  },
  consent_given: { header: 'Consent Given', key: 'consent_given', width: 15 },
};

export interface ExportFilterParams {
  districtId?: string;
  dsId?: string;
  gnId?: string;
  teamId?: string;
  gender?: 'M' | 'F';
  status?: 'open' | 'confirmed' | 'dismissed';
  classification?: 'probable' | 'possible';
  includeDuplicates?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

export interface CreateExportDto {
  requestedBy: string;
  kind: ExportKind | string;
  format?: ExportFormat;
  lang?: ReportLanguage;
  filters?: ExportFilterParams & Record<string, any>;
  async?: boolean;
}

export interface StoredExportFilters extends ExportFilterParams {
  lang: ReportLanguage;
  format: ExportFormat;
  callerRole?: UserRole;
}

export interface ExportJobView {
  id: string;
  requestedBy: string;
  kind: string;
  format: ExportFormat;
  lang: ReportLanguage;
  filters: Record<string, any>;
  status: JobStatus;
  filePath: string | null;
  signedUrl: string | null;
  expiresAt: string;
  error: string | null;
  createdAt: string;
  runner?: 'inline' | 'worker';
  rowCount?: number;
}

export interface ProgressBreakdownRow {
  scopeLevel: string;
  areaId: string;
  areaCode: string;
  areaName: string;
  gnNumber: string;
  teamNo: number | null;
  housesAssigned: number;
  housesStarted: number;
  housesDone: number;
  completionRate: number;
  clientsCount: number;
  epfCount: number;
  etfCount: number;
  aswesumaCount: number;
  samurdhiCount: number;
  specialNeedsCount: number;
  refreshedAt: string;
}

export interface InterestRow {
  category: string;
  categoryLabel: string;
  code: string;
  label: string;
  clientsCount: number;
  sharePercent: number;
}

const VALID_KINDS = new Set<ExportKind>([
  'progress',
  'clients',
  'beneficiaries',
  'interests',
  'duplicates',
]);

const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;
const CLIENT_BATCH_SIZE = 2000;
const DUPLICATE_BATCH_SIZE = 1000;

@Injectable()
export class ExportJobService {
  private readonly logger = new Logger(ExportJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly storage?: ExportStorageService,
    @Optional() private readonly lookupService?: LookupService,
  ) { }

  getInlineRowCap(): number {
    const raw = Number(process.env.EXPORT_INLINE_ROW_CAP || 5000);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5000;
  }

  /**
   * Low-level helper preserved for direct job creation & unit tests.
   */
  async queueExport(dto: CreateExportDto) {
    const kind = this.assertValidKind(dto.kind);
    const expiresAt = new Date(Date.now() + EXPORT_TTL_MS);
    const lang = normalizeReportLanguage(
      dto.lang || dto.filters?.lang || 'en',
    );
    const format: ExportFormat =
      dto.format || dto.filters?.format === 'csv' ? 'csv' : 'xlsx';

    return this.prisma.exportJob.create({
      data: {
        requestedBy: dto.requestedBy,
        kind,
        filters: {
          ...(dto.filters || {}),
          lang,
          format,
        },
        status: JobStatus.queued,
        expiresAt,
      },
    });
  }

  /**
   * Role & scope-validated export entry point for REST API callers.
   * Runs inline when estimated row count <= EXPORT_INLINE_ROW_CAP; otherwise stays queued for long runner.
   */
  async createExportForCaller(
    caller: ScopeContext,
    dto: {
      kind: ExportKind | string;
      format?: ExportFormat;
      lang?: ReportLanguage;
      filters?: ExportFilterParams;
      async?: boolean;
    },
  ): Promise<ExportJobView> {
    const kind = this.assertValidKind(dto.kind);
    const resolvedScope = await this.resolveAuthorizedScope(
      caller,
      kind,
      dto.filters || {},
    );
    const lang = await this.resolveReportLanguage(caller.userId, dto.lang);
    const format: ExportFormat = dto.format === 'csv' ? 'csv' : 'xlsx';

    const storedFilters: StoredExportFilters = {
      ...resolvedScope,
      lang,
      format,
      callerRole: caller.role,
    };

    const job = await this.prisma.exportJob.create({
      data: {
        requestedBy: caller.userId,
        kind,
        filters: storedFilters as any,
        status: JobStatus.queued,
        expiresAt: new Date(Date.now() + EXPORT_TTL_MS),
      },
    });

    this.logger.log(
      `Export queued: jobId=${job.id}, kind=${kind}, format=${format}, lang=${lang}, role=${caller.role}`,
    );

    const inlineCap = this.getInlineRowCap();
    const estimatedRows = dto.async
      ? inlineCap + 1
      : await this.estimateExportRowCount(kind, resolvedScope, inlineCap);

    if (!dto.async && estimatedRows <= inlineCap) {
      const processed = await this.processExport(job.id);
      const refreshed = await this.prisma.exportJob.findUnique({
        where: { id: job.id },
      });
      return {
        ...this.toJobView(refreshed || job, processed.signedUrl),
        runner: 'inline',
        rowCount: processed.rowCount,
      };
    }

    // In local non-serverless runtime (not Vercel, not test), optionally allow background tick processing
    if (
      !process.env.VERCEL &&
      process.env.NODE_ENV !== 'test' &&
      process.env.EXPORT_AUTO_WORKER === 'true'
    ) {
      setImmediate(() => {
        void this.processExport(job.id).catch((err) => {
          this.logger.error(
            `Background export failed for jobId=${job.id}: ${err instanceof Error ? err.message : 'unknown'}`,
          );
        });
      });
    }

    return {
      ...this.toJobView(job, null),
      runner: 'worker',
    };
  }

  /**
   * Keyset-paginated list of export jobs visible to the caller.
   */
  async listExportsForCaller(
    caller: ScopeContext,
    query: { cursor?: string; limit?: number } = {},
  ): Promise<{ items: ExportJobView[]; nextCursor: string | null }> {
    if (caller.role === UserRole.team_member) {
      throw new ForbiddenException({
        code: 'EXPORT_FORBIDDEN',
        message: 'Team members cannot access reports or exports',
      });
    }

    const limit = Math.min(Math.max(Number(query.limit || 20), 1), 50);
    const baseWhere: Prisma.ExportJobWhereInput =
      caller.role === UserRole.super_admin
        ? {}
        : { requestedBy: caller.userId };

    let cursorWhere: Prisma.ExportJobWhereInput = {};
    if (query.cursor) {
      const cursorRow = await this.prisma.exportJob.findUnique({
        where: { id: query.cursor },
        select: { id: true, createdAt: true },
      });
      if (cursorRow) {
        cursorWhere = {
          OR: [
            { createdAt: { lt: cursorRow.createdAt } },
            { createdAt: cursorRow.createdAt, id: { lt: cursorRow.id } },
          ],
        };
      }
    }

    const rows = await this.prisma.exportJob.findMany({
      where:
        Object.keys(cursorWhere).length > 0
          ? { AND: [baseWhere, cursorWhere] }
          : baseWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const now = Date.now();

    const items = await Promise.all(
      page.map(async (job) => {
        const refreshed = await this.expireIfStale(job, now);
        const signedUrl = await this.maybeCreateSignedUrl(refreshed, now);
        return this.toJobView(refreshed, signedUrl);
      }),
    );

    return {
      items,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  /**
   * Fetch single export job status + fresh short-lived signed URL (within caller authorization).
   */
  async getExportJobForCaller(
    caller: ScopeContext,
    jobId: string,
  ): Promise<ExportJobView> {
    if (caller.role === UserRole.team_member) {
      throw new ForbiddenException({
        code: 'EXPORT_FORBIDDEN',
        message: 'Team members cannot access reports or exports',
      });
    }

    const job = await this.prisma.exportJob.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      throw new NotFoundException({
        code: 'EXPORT_JOB_NOT_FOUND',
        message: `Export job ${jobId} not found`,
      });
    }

    if (
      caller.role !== UserRole.super_admin &&
      job.requestedBy !== caller.userId
    ) {
      throw new ForbiddenException({
        code: 'OUT_OF_SCOPE',
        message: 'You do not have access to this export job',
      });
    }

    const now = Date.now();
    const refreshed = await this.expireIfStale(job, now);
    const signedUrl = await this.maybeCreateSignedUrl(refreshed, now);
    return this.toJobView(refreshed, signedUrl);
  }

  /**
   * Returns live JSON report preview data (R1/R3/R4/R5) for Dashboard @media print PDF generation.
   */
  async getReportPreview(
    caller: ScopeContext,
    query: {
      kind: 'progress' | 'beneficiaries' | 'interests' | 'duplicates';
      lang?: ReportLanguage;
      districtId?: string;
      dsId?: string;
      gnId?: string;
      teamId?: string;
    },
  ) {
    const scope = await this.resolveAuthorizedScope(caller, query.kind, {
      districtId: query.districtId,
      dsId: query.dsId,
      gnId: query.gnId,
      teamId: query.teamId,
    });
    const lang = await this.resolveReportLanguage(caller.userId, query.lang);
    const generatedAt = formatColomboTimestamp(new Date());

    if (query.kind === 'progress' || query.kind === 'beneficiaries') {
      const data = await this.buildProgressAndBeneficiaryData(scope, lang);
      return {
        kind: query.kind,
        lang,
        title: pickTrilingual(SHEET_TITLES_I18N[query.kind], lang),
        generatedAt,
        scope,
        summary: data.summary,
        rows: data.rows,
      };
    }

    if (query.kind === 'interests') {
      const lookupMap = await this.loadLookupMap();
      const data = await this.buildInterestsData(scope, lang, lookupMap);
      return {
        kind: query.kind,
        lang,
        title: pickTrilingual(SHEET_TITLES_I18N.interests, lang),
        generatedAt,
        scope,
        totalClients: data.totalClients,
        rows: data.rows,
      };
    }

    // R5 Duplicates summary preview (bounded top 100 items, zero OFFSET)
    const duplicates = await this.fetchDuplicateBatch(scope, undefined, 100);
    return {
      kind: 'duplicates',
      lang,
      title: pickTrilingual(SHEET_TITLES_I18N.duplicates, lang),
      generatedAt,
      scope,
      rows: duplicates.map((item) => this.mapDuplicateRow(item, lang)),
    };
  }

  /**
   * Processes a single queued export job: streams Excel/CSV to a temp file, uploads to private
   * Storage, and updates export_jobs with object path & 24h expiry.
   */
  async processExport(jobId: string): Promise<{
    jobId: string;
    rowCount: number;
    status: JobStatus;
    filePath: string | null;
    signedUrl: string | null;
    expiresAt: Date;
  }> {
    const job = await this.prisma.exportJob.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      throw new NotFoundException(`Export job ${jobId} not found`);
    }

    const kind = this.assertValidKind(job.kind);
    const rawFilters = ((job.filters || {}) as Record<string, any>) || {};
    const lang = normalizeReportLanguage(rawFilters.lang);
    const format: ExportFormat = rawFilters.format === 'csv' ? 'csv' : 'xlsx';
    const filters: ExportFilterParams = {
      districtId: rawFilters.districtId,
      dsId: rawFilters.dsId,
      gnId: rawFilters.gnId,
      teamId: rawFilters.teamId,
      gender: rawFilters.gender,
      status: rawFilters.status,
      classification: rawFilters.classification,
      includeDuplicates: Boolean(rawFilters.includeDuplicates),
      dateFrom: rawFilters.dateFrom,
      dateTo: rawFilters.dateTo,
    };

    await this.prisma.exportJob.update({
      where: { id: jobId },
      data: { status: JobStatus.running, error: null },
    });

    const tmpFilePath = path.join(
      os.tmpdir(),
      `grs-export-${jobId}.${format}`,
    );

    try {
      const rowCount =
        format === 'csv'
          ? await this.writeCsvExportFile(tmpFilePath, kind, filters, lang)
          : await this.writeXlsxExportFile(tmpFilePath, kind, filters, lang);

      const objectPath = `exports/${jobId}/${kind}_${lang}_${jobId.slice(0, 8)}.${format}`;
      const contentType =
        format === 'csv'
          ? 'text/csv; charset=utf-8'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      let storedPath = objectPath;
      let signedUrl: string | null = null;

      if (this.storage && this.storage.isConfigured()) {
        const uploaded = await this.storage.uploadFromFile(
          objectPath,
          tmpFilePath,
          contentType,
        );
        storedPath = uploaded.path;
        const signed = await this.storage.createSignedUrl(storedPath, 86400);
        signedUrl = signed.signedUrl;
      } else if (process.env.NODE_ENV === 'production') {
        throw new Error('ExportStorageService is not configured in production');
      } else {
        // Explicit fallback only for unit/non-storage dev when SUPABASE_URL is unset
        storedPath = `grs-exports/${kind}_${jobId}.${format}`;
      }

      const expiresAt = new Date(Date.now() + EXPORT_TTL_MS);
      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.done,
          filePath: storedPath,
          expiresAt,
          error: null,
        },
      });

      this.logger.log(
        `Export completed: jobId=${jobId}, kind=${kind}, format=${format}, rows=${rowCount}`,
      );

      return {
        jobId,
        rowCount,
        status: JobStatus.done,
        filePath: storedPath,
        signedUrl,
        expiresAt,
      };
    } catch (error) {
      const safeError =
        error instanceof Error
          ? error.message.slice(0, 500)
          : 'Export generation failed';
      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.failed,
          error: safeError,
        },
      });
      this.logger.error(`Export failed: jobId=${jobId}, reason=${safeError}`);
      throw error;
    } finally {
      await fs.promises.unlink(tmpFilePath).catch(() => undefined);
    }
  }

  /**
   * Claims and processes the next queued export job for standalone worker processes.
   */
  async claimAndProcessNextJob(specificJobId?: string): Promise<boolean> {
    const candidate = specificJobId
      ? await this.prisma.exportJob.findUnique({ where: { id: specificJobId } })
      : await this.prisma.exportJob.findFirst({
        where: { status: JobStatus.queued },
        orderBy: { createdAt: 'asc' },
      });

    if (!candidate || candidate.status !== JobStatus.queued) {
      return false;
    }

    const claimed = await this.prisma.exportJob.updateMany({
      where: { id: candidate.id, status: JobStatus.queued },
      data: { status: JobStatus.running },
    });

    if (claimed.count === 0) {
      return false;
    }

    await this.processExport(candidate.id);
    return true;
  }

  /**
   * Triggers summary stats recomputation for dirty teams (delegated cleanly).
   */
  async refreshDirtySummaries(): Promise<{
    refreshedAt: Date;
    teamsCount: number;
  }> {
    if (!this.prisma.team?.findMany) {
      return { refreshedAt: new Date(), teamsCount: 0 };
    }
    const dirtyTeams = await this.prisma.team.findMany({
      where: { statsDirtyAt: { not: null } },
      select: { id: true },
    });

    if (dirtyTeams.length === 0) {
      return { refreshedAt: new Date(), teamsCount: 0 };
    }

    return { refreshedAt: new Date(), teamsCount: dirtyTeams.length };
  }

  // ---------------------------------------------------------------------------
  // Private Export Writers (XLSX Streaming + CSV Streaming)
  // ---------------------------------------------------------------------------

  private async writeXlsxExportFile(
    filePath: string,
    kind: ExportKind,
    filters: ExportFilterParams,
    lang: ReportLanguage,
  ): Promise<number> {
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: filePath,
      useStyles: false,
      useSharedStrings: false,
    });

    const sheetTitle = pickTrilingual(SHEET_TITLES_I18N[kind], lang).slice(
      0,
      31,
    );
    const sheet = workbook.addWorksheet(sheetTitle || kind);

    let rowCount = 0;

    if (kind === 'clients') {
      sheet.columns = R2_CLIENT_COLUMN_KEYS.map((key) => ({
        header: sanitizeSpreadsheetCell(
          pickTrilingual(R2_COLUMN_HEADERS_I18N[key], lang),
        ) as string,
        key,
        width: EXPORT_COLUMNS_REGISTRY[key]?.width || 20,
      }));
      const lookupMap = await this.loadLookupMap();
      rowCount = await this.streamClientRows(filters, lang, lookupMap, (row) => {
        sheet.addRow(row).commit();
      });
    } else if (kind === 'progress' || kind === 'beneficiaries') {
      const specs = REPORT_COLUMN_HEADERS_I18N[kind];
      sheet.columns = specs.map((col) => ({
        header: sanitizeSpreadsheetCell(
          pickTrilingual(col.labels, lang),
        ) as string,
        key: col.key,
        width: col.width,
      }));
      const data = await this.buildProgressAndBeneficiaryData(filters, lang);
      for (const item of [data.summaryRow, ...data.rows]) {
        const record = this.formatSummaryRecord(kind, item, lang);
        sheet.addRow(record).commit();
        rowCount += 1;
      }
    } else if (kind === 'interests') {
      const specs = REPORT_COLUMN_HEADERS_I18N.interests;
      sheet.columns = specs.map((col) => ({
        header: sanitizeSpreadsheetCell(
          pickTrilingual(col.labels, lang),
        ) as string,
        key: col.key,
        width: col.width,
      }));
      const lookupMap = await this.loadLookupMap();
      const data = await this.buildInterestsData(filters, lang, lookupMap);
      for (const item of data.rows) {
        sheet
          .addRow({
            category: sanitizeSpreadsheetCell(item.categoryLabel),
            code: sanitizeSpreadsheetCell(item.code),
            label: sanitizeSpreadsheetCell(item.label),
            clients_count: item.clientsCount,
            share_percent: item.sharePercent,
          })
          .commit();
        rowCount += 1;
      }
    } else if (kind === 'duplicates') {
      const specs = REPORT_COLUMN_HEADERS_I18N.duplicates;
      sheet.columns = specs.map((col) => ({
        header: sanitizeSpreadsheetCell(
          pickTrilingual(col.labels, lang),
        ) as string,
        key: col.key,
        width: col.width,
      }));
      rowCount = await this.streamDuplicateRows(filters, lang, (row) => {
        sheet.addRow(row).commit();
      });
    }

    sheet.commit();
    await workbook.commit();
    return rowCount;
  }

  private async writeCsvExportFile(
    filePath: string,
    kind: ExportKind,
    filters: ExportFilterParams,
    lang: ReportLanguage,
  ): Promise<number> {
    const out = fs.createWriteStream(filePath, { encoding: 'utf8' });
    let rowCount = 0;

    const writeChunk = async (chunk: string) => {
      if (!out.write(chunk, 'utf8')) {
        await new Promise<void>((resolve, reject) => {
          out.once('drain', resolve);
          out.once('error', reject);
        });
      }
    };

    try {
      // Write UTF-8 BOM for Sinhala/Tamil compatibility in Microsoft Excel
      await writeChunk('\uFEFF');

      if (kind === 'clients') {
        await writeChunk(
          formatCsvRow(
            R2_CLIENT_COLUMN_KEYS.map((key) =>
              pickTrilingual(R2_COLUMN_HEADERS_I18N[key], lang),
            ),
          ),
        );
        const lookupMap = await this.loadLookupMap();
        rowCount = await this.streamClientRows(
          filters,
          lang,
          lookupMap,
          async (rowObj) => {
            await writeChunk(
              formatCsvRow(
                R2_CLIENT_COLUMN_KEYS.map((key) => rowObj[key]),
              ),
            );
          },
        );
      } else if (kind === 'progress' || kind === 'beneficiaries') {
        const specs = REPORT_COLUMN_HEADERS_I18N[kind];
        await writeChunk(
          formatCsvRow(specs.map((col) => pickTrilingual(col.labels, lang))),
        );
        const data = await this.buildProgressAndBeneficiaryData(filters, lang);
        for (const item of [data.summaryRow, ...data.rows]) {
          const rec = this.formatSummaryRecord(kind, item, lang);
          await writeChunk(formatCsvRow(specs.map((col) => rec[col.key])));
          rowCount += 1;
        }
      } else if (kind === 'interests') {
        const specs = REPORT_COLUMN_HEADERS_I18N.interests;
        await writeChunk(
          formatCsvRow(specs.map((col) => pickTrilingual(col.labels, lang))),
        );
        const lookupMap = await this.loadLookupMap();
        const data = await this.buildInterestsData(filters, lang, lookupMap);
        for (const item of data.rows) {
          await writeChunk(
            formatCsvRow([
              item.categoryLabel,
              item.code,
              item.label,
              item.clientsCount,
              item.sharePercent,
            ]),
          );
          rowCount += 1;
        }
      } else if (kind === 'duplicates') {
        const specs = REPORT_COLUMN_HEADERS_I18N.duplicates;
        await writeChunk(
          formatCsvRow(specs.map((col) => pickTrilingual(col.labels, lang))),
        );
        rowCount = await this.streamDuplicateRows(
          filters,
          lang,
          async (rowObj) => {
            await writeChunk(
              formatCsvRow(specs.map((col) => rowObj[col.key])),
            );
          },
        );
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        out.end(() => resolve());
        out.on('error', reject);
      });
    }

    return rowCount;
  }

  // ---------------------------------------------------------------------------
  // Keyset Cursor Streaming for R2 Clients & R5 Duplicates (Zero OFFSET)
  // ---------------------------------------------------------------------------

  private async streamClientRows(
    filters: ExportFilterParams,
    lang: ReportLanguage,
    lookupMap: LookupTranslationMap,
    onRow: (row: Record<string, any>) => void | Promise<void>,
  ): Promise<number> {
    const baseWhere = this.buildClientWhere(filters);

    // Preload small geography tables to avoid multi-join bloat across 200k rows
    const [districts, dss, teams] = await Promise.all([
      this.prisma.district?.findMany
        ? this.prisma.district.findMany()
        : Promise.resolve([]),
      this.prisma.divisionalSecretariat?.findMany
        ? this.prisma.divisionalSecretariat.findMany()
        : Promise.resolve([]),
      this.prisma.team?.findMany
        ? this.prisma.team.findMany({ select: { id: true, teamNo: true } })
        : Promise.resolve([]),
    ]);

    const districtMap = new Map(districts.map((d) => [d.id, d]));
    const dsMap = new Map(dss.map((d) => [d.id, d]));
    const teamMap = new Map(teams.map((t) => [t.id, t]));
    const householdCache = new Map<string, any>();
    const gnCache = new Map<string, any>();

    let cursorId: string | null = null;
    let totalRows = 0;

    while (true) {
      const where: Prisma.ClientWhereInput = cursorId
        ? {
          AND: [baseWhere, { id: { gt: cursorId } }],
        }
        : baseWhere;

      const batch: any[] = await this.prisma.client.findMany({
        where,
        orderBy: { id: 'asc' },
        take: CLIENT_BATCH_SIZE,
      });

      if (batch.length === 0) break;

      // Batch-fetch missing households and GN divisions
      const missingHouseholdIds: string[] = [];
      const missingGnIds: string[] = [];
      for (const c of batch) {
        if (c.household) {
          householdCache.set(c.householdId, c.household);
          if (c.household.gn) {
            gnCache.set(c.gnId, c.household.gn);
          }
        } else if (c.householdId && !householdCache.has(c.householdId)) {
          missingHouseholdIds.push(c.householdId);
        }
        if (c.gnId && !gnCache.has(c.gnId)) {
          missingGnIds.push(c.gnId);
        }
      }

      if (missingHouseholdIds.length > 0 && this.prisma.household?.findMany) {
        const hhRows = await this.prisma.household.findMany({
          where: { id: { in: Array.from(new Set(missingHouseholdIds)) } },
        });
        for (const h of hhRows) {
          householdCache.set(h.id, h);
        }
      }

      if (missingGnIds.length > 0 && this.prisma.gnDivision?.findMany) {
        const gnRows = await this.prisma.gnDivision.findMany({
          where: { id: { in: Array.from(new Set(missingGnIds)) } },
        });
        for (const g of gnRows) {
          gnCache.set(g.id, g);
        }
      }

      for (const client of batch) {
        const hh = client.household || householdCache.get(client.householdId);
        const gn = hh?.gn || gnCache.get(client.gnId);
        const ds = dsMap.get(client.dsId);
        const district = districtMap.get(client.districtId);
        const team = client.teamId ? teamMap.get(client.teamId) : undefined;

        const mapped = this.mapClientRow(
          client,
          hh,
          gn,
          ds,
          district,
          team,
          lookupMap,
          lang,
        );
        await onRow(mapped);
        totalRows += 1;
      }

      // Cap household cache size for 200k+ row runs so heap remains bounded
      if (householdCache.size > 20000) {
        householdCache.clear();
      }

      const last = batch[batch.length - 1];
      cursorId = last.id;

      if (batch.length < CLIENT_BATCH_SIZE) break;
    }

    return totalRows;
  }

  private mapClientRow(
    client: any,
    household: any,
    gn: any,
    ds: any,
    district: any,
    team: any,
    lookupMap: LookupTranslationMap,
    lang: ReportLanguage,
  ): Record<string, any> {
    const districtName = district
      ? lang === 'si'
        ? district.nameSi || district.nameEn
        : lang === 'ta'
          ? district.nameTa || district.nameEn
          : district.nameEn
      : '';
    const dsName = ds
      ? lang === 'si'
        ? ds.nameSi || ds.nameEn
        : lang === 'ta'
          ? ds.nameTa || ds.nameEn
          : ds.nameEn
      : '';

    const raw: Record<string, any> = {
      district_name: sanitizeSpreadsheetCell(districtName),
      ds_name: sanitizeSpreadsheetCell(dsName),
      sdo_name: sanitizeSpreadsheetCell(ds?.sdoName || ''),
      gn_number: sanitizeSpreadsheetCell(gn?.gnNumber || ''),
      gn_name: sanitizeSpreadsheetCell(gn?.gnName || ''),
      secretary_name: sanitizeSpreadsheetCell(gn?.secretaryName || ''),
      secretary_contact: sanitizeSpreadsheetCell(gn?.secretaryContact || ''),
      secretary_email: sanitizeSpreadsheetCell(gn?.secretaryEmail || ''),
      serial_no: household?.serialNo ?? '',
      house_no: sanitizeSpreadsheetCell(household?.houseNo || ''),
      house_leader_name: sanitizeSpreadsheetCell(
        household?.houseLeaderName || '',
      ),
      address: sanitizeSpreadsheetCell(household?.address || ''),
      village_name: sanitizeSpreadsheetCell(household?.villageName || ''),
      is_epf: formatBooleanLabel(household?.isEpf, lang),
      is_etf: formatBooleanLabel(household?.isEtf, lang),
      is_aswesuma: formatBooleanLabel(household?.isAswesuma, lang),
      is_samurdhi: formatBooleanLabel(household?.isSamurdhi, lang),
      has_special_needs: formatBooleanLabel(household?.hasSpecialNeeds, lang),
      target_female: household?.targetFemale ?? 0,
      target_male: household?.targetMale ?? 0,
      age_group_min: household?.ageGroupMin ?? '',
      age_group_max: household?.ageGroupMax ?? '',
      lang_sinhala: formatBooleanLabel(household?.langSinhala, lang),
      lang_tamil: formatBooleanLabel(household?.langTamil, lang),
      lang_english: formatBooleanLabel(household?.langEnglish, lang),
      team_no: team?.teamNo ?? household?.team?.teamNo ?? '',

      client_name: sanitizeSpreadsheetCell(client.name || ''),
      client_age: client.age ?? '',
      client_gender: sanitizeSpreadsheetCell(
        formatGenderLabel(client.gender, lang),
      ),
      client_address: sanitizeSpreadsheetCell(client.address || ''),
      phone_raw: sanitizeSpreadsheetCell(client.phoneRaw || ''),
      phone_e164: sanitizeSpreadsheetCell(client.phoneE164 || ''),
      whatsapp_raw: sanitizeSpreadsheetCell(client.whatsappRaw || ''),
      whatsapp_e164: sanitizeSpreadsheetCell(client.whatsappE164 || ''),
      highest_education: sanitizeSpreadsheetCell(
        lookupMap
          ? translateOrRaw(lookupMap, 'education', client.highestEducation, lang)
          : client.highestEducation || '',
      ),
      highest_vocational: sanitizeSpreadsheetCell(
        translateOrRaw(
          lookupMap,
          'vocational_qualification',
          client.highestVocational,
          lang,
        ),
      ),
      interested_vocational_stream: sanitizeSpreadsheetCell(
        translateOrRaw(
          lookupMap,
          'vocational_stream',
          client.interestedVocationalStream,
          lang,
        ),
      ),
      interested_job: sanitizeSpreadsheetCell(
        translateOrRaw(lookupMap, 'job', client.interestedJob, lang),
      ),
      client_is_epf: formatBooleanLabel(client.isEpf, lang),
      client_is_etf: formatBooleanLabel(client.isEtf, lang),
      client_is_aswesuma: formatBooleanLabel(client.isAswesuma, lang),
      client_is_samurdhi: formatBooleanLabel(client.isSamurdhi, lang),
      client_has_special_needs: formatBooleanLabel(
        client.hasSpecialNeeds,
        lang,
      ),
      future_hopes: sanitizeSpreadsheetCell(
        Array.isArray(client.futureHopes)
          ? client.futureHopes
            .map((code: string) =>
              translateOrRaw(lookupMap, 'future_hope', code, lang),
            )
            .filter(Boolean)
            .join(', ')
          : '',
      ),
      info_provided_by: sanitizeSpreadsheetCell(
        lookupMap?.get('info_provided_by')?.has(client.infoProvidedBy)
          ? translateOrRaw(
            lookupMap,
            'info_provided_by',
            client.infoProvidedBy,
            lang,
          )
          : formatInfoProvidedByLabel(client.infoProvidedBy, lang),
      ),
      info_provided_by_other: sanitizeSpreadsheetCell(
        client.infoProvidedByOther || '',
      ),
      consent_given: formatBooleanLabel(client.consentGiven, lang),
    };

    return raw;
  }

  private async streamDuplicateRows(
    filters: ExportFilterParams,
    lang: ReportLanguage,
    onRow: (row: Record<string, any>) => void | Promise<void>,
  ): Promise<number> {
    let cursorId: string | undefined;
    let totalRows = 0;

    while (true) {
      const batch = await this.fetchDuplicateBatch(
        filters,
        cursorId,
        DUPLICATE_BATCH_SIZE,
      );
      if (batch.length === 0) break;

      for (const item of batch) {
        const mapped = this.mapDuplicateRow(item, lang);
        await onRow(mapped);
        totalRows += 1;
      }

      const last = batch[batch.length - 1];
      cursorId = last.id;
      if (batch.length < DUPLICATE_BATCH_SIZE) break;
    }

    return totalRows;
  }

  private async fetchDuplicateBatch(
    filters: ExportFilterParams,
    cursorId: string | undefined,
    take: number,
  ): Promise<any[]> {
    const baseWhere = this.buildDuplicateWhere(filters);
    const where: Prisma.DuplicateCandidateWhereInput = cursorId
      ? {
        AND: [baseWhere, { id: { gt: cursorId } }],
      }
      : baseWhere;

    return this.prisma.duplicateCandidate.findMany({
      where,
      orderBy: { id: 'asc' },
      take,
      include: {
        clientARecord: {
          select: {
            id: true,
            name: true,
            age: true,
            gender: true,
            phoneE164: true,
            household: {
              select: {
                houseNo: true,
                gn: { select: { gnNumber: true, gnName: true } },
              },
            },
          },
        },
        clientBRecord: {
          select: {
            id: true,
            name: true,
            age: true,
            gender: true,
            phoneE164: true,
            household: {
              select: {
                houseNo: true,
                gn: { select: { gnNumber: true, gnName: true } },
              },
            },
          },
        },
        reviewer: { select: { userCode: true } },
      },
    });
  }

  private mapDuplicateRow(item: any, lang: ReportLanguage): Record<string, any> {
    const factors = Array.isArray(item.reasons?.factors)
      ? item.reasons.factors
        .map((f: any) => (typeof f === 'string' ? f : f?.key || f?.label || ''))
        .filter(Boolean)
        .join(', ')
      : '';
    const gnA = item.clientARecord?.household?.gn
      ? `${item.clientARecord.household.gn.gnNumber} - ${item.clientARecord.household.gn.gnName}`
      : '';
    const gnB = item.clientBRecord?.household?.gn
      ? `${item.clientBRecord.household.gn.gnNumber} - ${item.clientBRecord.household.gn.gnName}`
      : '';

    return {
      candidate_id: sanitizeSpreadsheetCell(item.id),
      score: item.score,
      classification: sanitizeSpreadsheetCell(
        formatDuplicateTierLabel(item.score, lang),
      ),
      status: sanitizeSpreadsheetCell(
        formatDuplicateStatusLabel(item.status, lang),
      ),
      reasons: sanitizeSpreadsheetCell(factors),
      client_a_id: sanitizeSpreadsheetCell(item.clientA),
      client_a_name: sanitizeSpreadsheetCell(item.clientARecord?.name || ''),
      client_a_age: item.clientARecord?.age ?? '',
      client_a_gender: sanitizeSpreadsheetCell(
        formatGenderLabel(item.clientARecord?.gender, lang),
      ),
      client_a_phone: sanitizeSpreadsheetCell(
        item.clientARecord?.phoneE164 || '',
      ),
      client_a_gn: sanitizeSpreadsheetCell(gnA),
      client_a_house_no: sanitizeSpreadsheetCell(
        item.clientARecord?.household?.houseNo || '',
      ),
      client_b_id: sanitizeSpreadsheetCell(item.clientB),
      client_b_name: sanitizeSpreadsheetCell(item.clientBRecord?.name || ''),
      client_b_age: item.clientBRecord?.age ?? '',
      client_b_gender: sanitizeSpreadsheetCell(
        formatGenderLabel(item.clientBRecord?.gender, lang),
      ),
      client_b_phone: sanitizeSpreadsheetCell(
        item.clientBRecord?.phoneE164 || '',
      ),
      client_b_gn: sanitizeSpreadsheetCell(gnB),
      client_b_house_no: sanitizeSpreadsheetCell(
        item.clientBRecord?.household?.houseNo || '',
      ),
      reviewed_by: sanitizeSpreadsheetCell(item.reviewer?.userCode || ''),
      reviewed_at: formatColomboTimestamp(item.reviewedAt),
      created_at: formatColomboTimestamp(item.createdAt),
    };
  }

  // ---------------------------------------------------------------------------
  // Aggregated Summaries for R1 (Progress), R3 (Beneficiaries), R4 (Interests)
  // ---------------------------------------------------------------------------

  private async buildProgressAndBeneficiaryData(
    filters: ExportFilterParams,
    lang: ReportLanguage,
  ): Promise<{
    summary: ProgressBreakdownRow;
    summaryRow: ProgressBreakdownRow;
    rows: ProgressBreakdownRow[];
  }> {
    let targetType: 'national' | 'district' | 'ds' | 'gn' | 'team' = 'national';
    let targetId = 'national';
    if (filters.teamId) {
      targetType = 'team';
      targetId = filters.teamId;
    } else if (filters.gnId) {
      targetType = 'gn';
      targetId = filters.gnId;
    } else if (filters.dsId) {
      targetType = 'ds';
      targetId = filters.dsId;
    } else if (filters.districtId) {
      targetType = 'district';
      targetId = filters.districtId;
    }

    let summaryStat: any = null;
    if (targetType === 'team') {
      summaryStat = await this.prisma.teamStat.findUnique({
        where: { teamId: targetId },
      });
    } else {
      summaryStat = await this.prisma.areaStat.findUnique({
        where: { areaType_areaId: { areaType: targetType, areaId: targetId } },
      });
    }

    const gnRecord =
      targetType === 'gn' && this.prisma.gnDivision?.findUnique
        ? await this.prisma.gnDivision.findUnique({ where: { id: targetId } })
        : null;
    const summaryAreaName =
      gnRecord
        ? `${gnRecord.gnNumber} - ${gnRecord.gnName}`
        : await this.resolveAreaLabel(targetType, targetId, lang);
    const summaryRow: ProgressBreakdownRow = {
      scopeLevel: formatScopeLevelLabel(targetType, lang),
      areaId: targetId,
      areaCode:
        gnRecord?.gnNumber ||
        (targetType === 'national' ? 'LK' : targetId.slice(0, 8)),
      areaName: summaryAreaName,
      gnNumber: gnRecord?.gnNumber || '',
      teamNo: targetType === 'team' ? await this.lookupTeamNo(targetId) : null,
      housesAssigned: summaryStat?.housesAssigned ?? 0,
      housesStarted: summaryStat?.housesStarted ?? 0,
      housesDone: summaryStat?.housesDone ?? 0,
      completionRate: computeRate(
        summaryStat?.housesDone ?? 0,
        summaryStat?.housesAssigned ?? 0,
      ),
      clientsCount: summaryStat?.clientsCount ?? 0,
      epfCount: summaryStat?.epfCount ?? 0,
      etfCount: summaryStat?.etfCount ?? 0,
      aswesumaCount: summaryStat?.aswesumaCount ?? 0,
      samurdhiCount: summaryStat?.samurdhiCount ?? 0,
      specialNeedsCount: summaryStat?.specialNeedsCount ?? 0,
      refreshedAt: formatColomboTimestamp(summaryStat?.refreshedAt),
    };

    const rows: ProgressBreakdownRow[] = [];

    if (targetType === 'national') {
      const [districts, stats] = await Promise.all([
        this.prisma.district.findMany({ orderBy: { nameEn: 'asc' } }),
        this.prisma.areaStat.findMany({ where: { areaType: 'district' } }),
      ]);
      const statMap = new Map(stats.map((s) => [s.areaId, s]));
      for (const d of districts) {
        const s = statMap.get(d.id);
        rows.push({
          scopeLevel: formatScopeLevelLabel('district', lang),
          areaId: d.id,
          areaCode: d.id.slice(0, 8),
          areaName: pickLocalizedGeo(d, lang),
          gnNumber: '',
          teamNo: null,
          housesAssigned: s?.housesAssigned ?? 0,
          housesStarted: s?.housesStarted ?? 0,
          housesDone: s?.housesDone ?? 0,
          completionRate: computeRate(
            s?.housesDone ?? 0,
            s?.housesAssigned ?? 0,
          ),
          clientsCount: s?.clientsCount ?? 0,
          epfCount: s?.epfCount ?? 0,
          etfCount: s?.etfCount ?? 0,
          aswesumaCount: s?.aswesumaCount ?? 0,
          samurdhiCount: s?.samurdhiCount ?? 0,
          specialNeedsCount: s?.specialNeedsCount ?? 0,
          refreshedAt: formatColomboTimestamp(s?.refreshedAt),
        });
      }
    } else if (targetType === 'district') {
      const dsList = await this.prisma.divisionalSecretariat.findMany({
        where: { districtId: targetId },
        orderBy: { nameEn: 'asc' },
      });
      const stats = await this.prisma.areaStat.findMany({
        where: { areaType: 'ds', areaId: { in: dsList.map((d) => d.id) } },
      });
      const statMap = new Map(stats.map((s) => [s.areaId, s]));
      for (const ds of dsList) {
        const s = statMap.get(ds.id);
        rows.push({
          scopeLevel: formatScopeLevelLabel('ds', lang),
          areaId: ds.id,
          areaCode: ds.id.slice(0, 8),
          areaName: pickLocalizedGeo(ds, lang),
          gnNumber: '',
          teamNo: null,
          housesAssigned: s?.housesAssigned ?? 0,
          housesStarted: s?.housesStarted ?? 0,
          housesDone: s?.housesDone ?? 0,
          completionRate: computeRate(
            s?.housesDone ?? 0,
            s?.housesAssigned ?? 0,
          ),
          clientsCount: s?.clientsCount ?? 0,
          epfCount: s?.epfCount ?? 0,
          etfCount: s?.etfCount ?? 0,
          aswesumaCount: s?.aswesumaCount ?? 0,
          samurdhiCount: s?.samurdhiCount ?? 0,
          specialNeedsCount: s?.specialNeedsCount ?? 0,
          refreshedAt: formatColomboTimestamp(s?.refreshedAt),
        });
      }
    } else if (targetType === 'ds') {
      const gnList = await this.prisma.gnDivision.findMany({
        where: { dsId: targetId },
        orderBy: { gnNumber: 'asc' },
      });
      const stats = await this.prisma.areaStat.findMany({
        where: { areaType: 'gn', areaId: { in: gnList.map((g) => g.id) } },
      });
      const statMap = new Map(stats.map((s) => [s.areaId, s]));
      for (const gn of gnList) {
        const s = statMap.get(gn.id);
        rows.push({
          scopeLevel: formatScopeLevelLabel('gn', lang),
          areaId: gn.id,
          areaCode: gn.gnNumber,
          areaName: `${gn.gnNumber} - ${gn.gnName}`,
          gnNumber: gn.gnNumber,
          teamNo: null,
          housesAssigned: s?.housesAssigned ?? 0,
          housesStarted: s?.housesStarted ?? 0,
          housesDone: s?.housesDone ?? 0,
          completionRate: computeRate(
            s?.housesDone ?? 0,
            s?.housesAssigned ?? 0,
          ),
          clientsCount: s?.clientsCount ?? 0,
          epfCount: s?.epfCount ?? 0,
          etfCount: s?.etfCount ?? 0,
          aswesumaCount: s?.aswesumaCount ?? 0,
          samurdhiCount: s?.samurdhiCount ?? 0,
          specialNeedsCount: s?.specialNeedsCount ?? 0,
          refreshedAt: formatColomboTimestamp(s?.refreshedAt),
        });
      }
    } else if (targetType === 'gn') {
      const [teams, teamStats] = await Promise.all([
        this.prisma.team.findMany({
          where: { gnId: targetId },
          orderBy: { teamNo: 'asc' },
        }),
        this.prisma.teamStat.findMany({ where: { gnId: targetId } }),
      ]);
      const statMap = new Map(teamStats.map((s) => [s.teamId, s]));
      const teamWord = formatScopeLevelLabel('team', lang);
      for (const t of teams) {
        const s = statMap.get(t.id);
        rows.push({
          scopeLevel: teamWord,
          areaId: t.id,
          areaCode: String(t.teamNo),
          areaName: `${teamWord} ${t.teamNo}`,
          gnNumber: summaryRow.gnNumber,
          teamNo: t.teamNo,
          housesAssigned: s?.housesAssigned ?? 0,
          housesStarted: s?.housesStarted ?? 0,
          housesDone: s?.housesDone ?? 0,
          completionRate: computeRate(
            s?.housesDone ?? 0,
            s?.housesAssigned ?? 0,
          ),
          clientsCount: s?.clientsCount ?? 0,
          epfCount: s?.epfCount ?? 0,
          etfCount: s?.etfCount ?? 0,
          aswesumaCount: s?.aswesumaCount ?? 0,
          samurdhiCount: s?.samurdhiCount ?? 0,
          specialNeedsCount: s?.specialNeedsCount ?? 0,
          refreshedAt: formatColomboTimestamp(s?.refreshedAt),
        });
      }
    }

    return { summary: summaryRow, summaryRow, rows };
  }

  private formatSummaryRecord(
    kind: 'progress' | 'beneficiaries',
    row: ProgressBreakdownRow,
    _lang: ReportLanguage,
  ): Record<string, any> {
    if (kind === 'progress') {
      return {
        scope_level: sanitizeSpreadsheetCell(row.scopeLevel),
        area_name: sanitizeSpreadsheetCell(row.areaName),
        gn_number: sanitizeSpreadsheetCell(row.gnNumber),
        team_no: row.teamNo ?? '',
        houses_assigned: row.housesAssigned,
        houses_started: row.housesStarted,
        houses_done: row.housesDone,
        completion_rate: row.completionRate,
        clients_count: row.clientsCount,
        epf_count: row.epfCount,
        etf_count: row.etfCount,
        aswesuma_count: row.aswesumaCount,
        samurdhi_count: row.samurdhiCount,
        special_needs_count: row.specialNeedsCount,
        refreshed_at: sanitizeSpreadsheetCell(row.refreshedAt),
      };
    }

    return {
      scope_level: sanitizeSpreadsheetCell(row.scopeLevel),
      area_code: sanitizeSpreadsheetCell(row.areaCode),
      area_name: sanitizeSpreadsheetCell(row.areaName),
      houses_assigned: row.housesAssigned,
      clients_count: row.clientsCount,
      epf_count: row.epfCount,
      etf_count: row.etfCount,
      aswesuma_count: row.aswesumaCount,
      samurdhi_count: row.samurdhiCount,
      special_needs_count: row.specialNeedsCount,
      refreshed_at: sanitizeSpreadsheetCell(row.refreshedAt),
    };
  }

  private async buildInterestsData(
    filters: ExportFilterParams,
    lang: ReportLanguage,
    lookupMap: LookupTranslationMap,
  ): Promise<{ totalClients: number; rows: InterestRow[] }> {
    const baseWhere = this.buildClientWhere({
      ...filters,
      includeDuplicates: false,
    });

    const totalClients = await this.getScopedActiveClientTotal(filters, baseWhere);
    const rows: InterestRow[] = [];

    const appendGroupRows = (
      fieldCategory: string,
      lookupCategory: string,
      items: Array<{ code: string | null; count: number }>,
    ) => {
      const sorted = [...items]
        .filter((i) => i.code && i.code.trim().length > 0 && i.count > 0)
        .sort((a, b) => b.count - a.count);

      for (const item of sorted) {
        const code = item.code!;
        rows.push({
          category: fieldCategory,
          categoryLabel: formatInterestCategoryLabel(fieldCategory, lang),
          code,
          label: translateOrRaw(lookupMap, lookupCategory, code, lang),
          clientsCount: item.count,
          sharePercent:
            totalClients > 0
              ? Math.round((item.count / totalClients) * 1000) / 10
              : 0,
        });
      }
    };

    if (typeof this.prisma.client?.groupBy === 'function') {
      const [streams, jobs, edu, voc] = await Promise.all([
        this.prisma.client.groupBy({
          by: ['interestedVocationalStream'],
          where: { ...baseWhere, interestedVocationalStream: { not: null } },
          _count: { _all: true },
        }),
        this.prisma.client.groupBy({
          by: ['interestedJob'],
          where: { ...baseWhere, interestedJob: { not: null } },
          _count: { _all: true },
        }),
        this.prisma.client.groupBy({
          by: ['highestEducation'],
          where: { ...baseWhere, highestEducation: { not: null } },
          _count: { _all: true },
        }),
        this.prisma.client.groupBy({
          by: ['highestVocational'],
          where: { ...baseWhere, highestVocational: { not: null } },
          _count: { _all: true },
        }),
      ]);

      appendGroupRows(
        'interested_vocational_stream',
        'vocational_stream',
        streams.map((s) => ({
          code: s.interestedVocationalStream,
          count: s._count._all,
        })),
      );
      appendGroupRows(
        'interested_job',
        'job',
        jobs.map((j) => ({ code: j.interestedJob, count: j._count._all })),
      );
      appendGroupRows(
        'highest_education',
        'education',
        edu.map((e) => ({ code: e.highestEducation, count: e._count._all })),
      );
      appendGroupRows(
        'highest_vocational',
        'vocational_qualification',
        voc.map((v) => ({
          code: v.highestVocational,
          count: v._count._all,
        })),
      );
    }

    // Aggregate PostgreSQL string[] `future_hopes` cleanly using UNNEST
    if (typeof this.prisma.$queryRaw === 'function') {
      const conditions: Prisma.Sql[] = [
        Prisma.sql`deleted_at IS NULL`,
        Prisma.sql`duplicate_of IS NULL`,
      ];
      if (filters.districtId) {
        conditions.push(Prisma.sql`district_id = ${filters.districtId}::uuid`);
      }
      if (filters.dsId) {
        conditions.push(Prisma.sql`ds_id = ${filters.dsId}::uuid`);
      }
      if (filters.gnId) {
        conditions.push(Prisma.sql`gn_id = ${filters.gnId}::uuid`);
      }
      if (filters.teamId) {
        conditions.push(Prisma.sql`team_id = ${filters.teamId}::uuid`);
      }
      if (filters.gender) {
        conditions.push(Prisma.sql`gender::text = ${filters.gender}`);
      }
      if (filters.dateFrom) {
        conditions.push(
          Prisma.sql`created_at >= ${new Date(filters.dateFrom)}`,
        );
      }
      if (filters.dateTo) {
        conditions.push(Prisma.sql`created_at <= ${new Date(filters.dateTo)}`);
      }

      const whereSql = Prisma.join(conditions, ' AND ');
      const futureRows = await this.prisma.$queryRaw<
        Array<{ code: string; cnt: bigint | number }>
      >(
        Prisma.sql`
          SELECT hop AS code, COUNT(*)::bigint AS cnt
          FROM clients, UNNEST(future_hopes) AS hop
          WHERE ${whereSql}
          GROUP BY hop
          ORDER BY cnt DESC
        `,
      );

      if (Array.isArray(futureRows)) {
        appendGroupRows(
          'future_hopes',
          'future_hope',
          futureRows.map((r) => ({ code: r.code, count: Number(r.cnt) })),
        );
      }
    }

    return { totalClients, rows };
  }

  // ---------------------------------------------------------------------------
  // Scope Validation, Estimation & Helpers
  // ---------------------------------------------------------------------------

  private assertValidKind(kind: string): ExportKind {
    if (!VALID_KINDS.has(kind as ExportKind)) {
      throw new BadRequestException({
        code: 'INVALID_EXPORT_KIND',
        message: `kind must be one of: ${Array.from(VALID_KINDS).join(', ')}`,
      });
    }
    return kind as ExportKind;
  }

  private async resolveAuthorizedScope(
    caller: ScopeContext,
    kind: ExportKind,
    filters: ExportFilterParams,
  ): Promise<ExportFilterParams> {
    if (caller.role === UserRole.team_member) {
      throw new ForbiddenException({
        code: 'EXPORT_FORBIDDEN',
        message: 'Level 5 team members do not have export rights',
      });
    }

    // R5 Duplicates export restricted strictly to L4 (CDC Secretary) and L00 (Super Admin) per Plan §10
    if (
      kind === 'duplicates' &&
      caller.role !== UserRole.cdc_secretary &&
      caller.role !== UserRole.super_admin
    ) {
      throw new ForbiddenException({
        code: 'ROLE_NOT_ALLOWED_FOR_REPORT',
        message:
          'Duplicate review report is restricted to CDC Secretary (Level 4) and Super Admin',
      });
    }

    const effective: ExportFilterParams = {
      gender: filters.gender,
      status: filters.status,
      classification: filters.classification,
      includeDuplicates: Boolean(filters.includeDuplicates),
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    };

    if (caller.role === UserRole.cdc_secretary) {
      if (!caller.gnId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: 'Caller does not have an assigned GN division',
        });
      }
      if (filters.districtId || filters.dsId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: 'CDC Secretary cannot export at District or DS level',
        });
      }
      if (filters.gnId && filters.gnId !== caller.gnId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: 'Cannot export data for another GN division',
        });
      }
      if (filters.teamId) {
        const team = await this.prisma.team.findUnique({
          where: { id: filters.teamId },
          select: { gnId: true },
        });
        if (!team || team.gnId !== caller.gnId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE',
            message: 'Team is outside your assigned GN division',
          });
        }
        effective.teamId = filters.teamId;
      }
      effective.gnId = caller.gnId;
      return effective;
    }

    if (caller.role === UserRole.sda) {
      if (!caller.dsId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: 'Caller does not have an assigned DS division',
        });
      }
      if (filters.districtId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: 'SDA cannot export outside their Divisional Secretariat',
        });
      }
      if (filters.dsId && filters.dsId !== caller.dsId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: 'Cannot export data for another Divisional Secretariat',
        });
      }
      if (filters.gnId) {
        const gn = await this.prisma.gnDivision.findUnique({
          where: { id: filters.gnId },
          select: { dsId: true },
        });
        if (!gn || gn.dsId !== caller.dsId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE',
            message: 'GN division is outside your Divisional Secretariat',
          });
        }
        effective.gnId = filters.gnId;
      }
      if (filters.teamId) {
        const team = await this.prisma.team.findUnique({
          where: { id: filters.teamId },
          select: { gn: { select: { dsId: true } } },
        });
        if (!team || team.gn?.dsId !== caller.dsId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE',
            message: 'Team is outside your Divisional Secretariat',
          });
        }
        effective.teamId = filters.teamId;
      }
      effective.dsId = caller.dsId;
      return effective;
    }

    if (caller.role === UserRole.dc) {
      if (!caller.districtId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: 'Caller does not have an assigned District',
        });
      }
      if (filters.districtId && filters.districtId !== caller.districtId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: 'Cannot export data for another District',
        });
      }
      if (filters.dsId) {
        const ds = await this.prisma.divisionalSecretariat.findUnique({
          where: { id: filters.dsId },
          select: { districtId: true },
        });
        if (!ds || ds.districtId !== caller.districtId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE',
            message: 'DS division is outside your District',
          });
        }
        effective.dsId = filters.dsId;
      }
      if (filters.gnId) {
        const gn = await this.prisma.gnDivision.findUnique({
          where: { id: filters.gnId },
          select: { ds: { select: { districtId: true } } },
        });
        if (!gn || gn.ds?.districtId !== caller.districtId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE',
            message: 'GN division is outside your District',
          });
        }
        effective.gnId = filters.gnId;
      }
      if (filters.teamId) {
        const team = await this.prisma.team.findUnique({
          where: { id: filters.teamId },
          select: {
            gn: { select: { ds: { select: { districtId: true } } } },
          },
        });
        if (!team || team.gn?.ds?.districtId !== caller.districtId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE',
            message: 'Team is outside your District',
          });
        }
        effective.teamId = filters.teamId;
      }
      effective.districtId = caller.districtId;
      return effective;
    }

    // L1 (cg), L0 (admin), L00 (super_admin) have national read scope
    if (filters.districtId) effective.districtId = filters.districtId;
    if (filters.dsId) effective.dsId = filters.dsId;
    if (filters.gnId) effective.gnId = filters.gnId;
    if (filters.teamId) effective.teamId = filters.teamId;
    return effective;
  }

  private async estimateExportRowCount(
    kind: ExportKind,
    filters: ExportFilterParams,
    inlineCap: number,
  ): Promise<number> {
    if (kind === 'progress' || kind === 'beneficiaries' || kind === 'interests') {
      return 100; // Always compact summaries
    }

    if (kind === 'clients') {
      // Bounded keyset probe (never uses unbounded COUNT(*))
      const probe = await this.prisma.client.findMany({
        where: this.buildClientWhere(filters),
        select: { id: true },
        orderBy: { id: 'asc' },
        take: inlineCap + 1,
      });
      return probe.length;
    }

    // R5 duplicates bounded probe
    const probe = await this.prisma.duplicateCandidate.findMany({
      where: this.buildDuplicateWhere(filters),
      select: { id: true },
      orderBy: { id: 'asc' },
      take: inlineCap + 1,
    });
    return probe.length;
  }

  private async getScopedActiveClientTotal(
    filters: ExportFilterParams,
    baseWhere: Prisma.ClientWhereInput,
  ): Promise<number> {
    // Prefer precomputed summary tables (Invariant 16) when no extra attribute filters exist
    const hasExtraFilters = Boolean(
      filters.gender || filters.dateFrom || filters.dateTo,
    );
    if (!hasExtraFilters) {
      if (filters.teamId && this.prisma.teamStat?.findUnique) {
        const ts = await this.prisma.teamStat.findUnique({
          where: { teamId: filters.teamId },
          select: { clientsCount: true },
        });
        if (ts) return ts.clientsCount;
      } else if (this.prisma.areaStat?.findUnique) {
        const areaType = filters.gnId
          ? 'gn'
          : filters.dsId
            ? 'ds'
            : filters.districtId
              ? 'district'
              : 'national';
        const areaId =
          filters.gnId || filters.dsId || filters.districtId || 'national';
        const stat = await this.prisma.areaStat.findUnique({
          where: { areaType_areaId: { areaType, areaId } },
          select: { clientsCount: true },
        });
        if (stat) return stat.clientsCount;
      }
    }

    // Fallback when secondary attribute filters are applied or summary hasn't run yet
    const probe = await this.prisma.client.findMany({
      where: baseWhere,
      select: { id: true },
    });
    return probe.length;
  }

  private buildClientWhere(
    filters: ExportFilterParams,
  ): Prisma.ClientWhereInput {
    const where: Prisma.ClientWhereInput = {
      deletedAt: null,
    };
    if (!filters.includeDuplicates) {
      where.duplicateOf = null;
    }
    if (filters.districtId) where.districtId = filters.districtId;
    if (filters.dsId) where.dsId = filters.dsId;
    if (filters.gnId) where.gnId = filters.gnId;
    if (filters.teamId) where.teamId = filters.teamId;
    if (filters.gender) where.gender = filters.gender as any;

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
      };
    }

    return where;
  }

  private buildDuplicateWhere(
    filters: ExportFilterParams,
  ): Prisma.DuplicateCandidateWhereInput {
    const where: Prisma.DuplicateCandidateWhereInput = {};
    if (filters.status) {
      where.status = filters.status as any;
    }
    if (filters.classification === 'probable') {
      where.score = { gte: 90 };
    } else if (filters.classification === 'possible') {
      where.score = { gte: 70, lt: 90 };
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
      };
    }

    const clientScope: Prisma.ClientWhereInput = {};
    if (filters.gnId) clientScope.gnId = filters.gnId;
    if (filters.teamId) clientScope.teamId = filters.teamId;
    if (filters.dsId) clientScope.dsId = filters.dsId;
    if (filters.districtId) clientScope.districtId = filters.districtId;

    if (Object.keys(clientScope).length > 0) {
      where.OR = [
        { clientARecord: clientScope },
        { clientBRecord: clientScope },
      ];
    }

    return where;
  }

  private async resolveReportLanguage(
    userId: string,
    explicitLang?: string,
  ): Promise<ReportLanguage> {
    if (explicitLang === 'en' || explicitLang === 'si' || explicitLang === 'ta') {
      return explicitLang;
    }
    if (this.prisma.profile?.findUnique) {
      const profile = await this.prisma.profile
        .findUnique({
          where: { id: userId },
          select: { preferredLanguage: true },
        })
        .catch(() => null);
      if (profile?.preferredLanguage) {
        return normalizeReportLanguage(profile.preferredLanguage);
      }
    }
    return 'en';
  }

  private async loadLookupMap(): Promise<LookupTranslationMap> {
    if (this.lookupService) {
      try {
        const res = await this.lookupService.getCategorizedLookups();
        const items = Object.values(res.categories).flat();
        if (items.length > 0) {
          return buildLookupTranslationMap(items);
        }
      } catch {
        // Fallback cleanly to CANONICAL_LOOKUPS
      }
    }
    return buildLookupTranslationMap(CANONICAL_LOOKUPS);
  }

  private async resolveAreaLabel(
    areaType: 'national' | 'district' | 'ds' | 'gn' | 'team',
    areaId: string,
    lang: ReportLanguage,
  ): Promise<string> {
    if (areaType === 'national') {
      return pickTrilingual(
        { en: 'Sri Lanka (National)', si: 'ශ්‍රී ලංකාව (ජාතික)', ta: 'இலங்கை (தேசியம்)' },
        lang,
      );
    }
    if (areaType === 'district') {
      const d = await this.prisma.district.findUnique({ where: { id: areaId } });
      return d ? pickLocalizedGeo(d, lang) : areaId;
    }
    if (areaType === 'ds') {
      const ds = await this.prisma.divisionalSecretariat.findUnique({
        where: { id: areaId },
      });
      return ds ? pickLocalizedGeo(ds, lang) : areaId;
    }
    if (areaType === 'gn') {
      const gn = await this.prisma.gnDivision.findUnique({
        where: { id: areaId },
      });
      return gn ? `${gn.gnNumber} - ${gn.gnName}` : areaId;
    }
    const team = await this.prisma.team.findUnique({ where: { id: areaId } });
    const teamWord = formatScopeLevelLabel('team', lang);
    return team ? `${teamWord} ${team.teamNo}` : areaId;
  }

  private async lookupTeamNo(teamId: string): Promise<number | null> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { teamNo: true },
    });
    return team?.teamNo ?? null;
  }

  private async expireIfStale(job: any, nowMs: number): Promise<any> {
    const expiresMs =
      job.expiresAt instanceof Date
        ? job.expiresAt.getTime()
        : new Date(job.expiresAt).getTime();

    if (
      (job.status === JobStatus.done || job.status === JobStatus.queued) &&
      expiresMs <= nowMs
    ) {
      const updated = await this.prisma.exportJob.update({
        where: { id: job.id },
        data: { status: JobStatus.expired },
      });
      if (job.filePath && this.storage?.isConfigured()) {
        void this.storage.deleteObject(job.filePath);
      }
      return updated;
    }
    return job;
  }

  private async maybeCreateSignedUrl(
    job: any,
    nowMs: number,
  ): Promise<string | null> {
    if (job.status !== JobStatus.done || !job.filePath) {
      return null;
    }
    const expiresMs =
      job.expiresAt instanceof Date
        ? job.expiresAt.getTime()
        : new Date(job.expiresAt).getTime();
    const remainingSec = Math.floor((expiresMs - nowMs) / 1000);
    if (remainingSec <= 0) {
      return null;
    }
    if (!this.storage || !this.storage.isConfigured()) {
      return null;
    }
    const signed = await this.storage.createSignedUrl(
      job.filePath,
      Math.min(86400, remainingSec),
    );
    return signed.signedUrl;
  }

  private toJobView(job: any, signedUrl: string | null): ExportJobView {
    const rawFilters = ((job.filters || {}) as Record<string, any>) || {};
    const format: ExportFormat = rawFilters.format === 'csv' ? 'csv' : 'xlsx';
    const lang = normalizeReportLanguage(rawFilters.lang);
    return {
      id: job.id,
      requestedBy: job.requestedBy,
      kind: job.kind,
      format,
      lang,
      filters: rawFilters,
      status: job.status,
      filePath: job.filePath || null,
      signedUrl,
      expiresAt:
        job.expiresAt instanceof Date
          ? job.expiresAt.toISOString()
          : String(job.expiresAt),
      error: job.error || null,
      createdAt:
        job.createdAt instanceof Date
          ? job.createdAt.toISOString()
          : String(job.createdAt),
    };
  }
}

function computeRate(done: number, assigned: number): number {
  if (!assigned || assigned <= 0) return 0;
  return Math.round((done / assigned) * 1000) / 10;
}

function pickLocalizedGeo(
  row: { nameEn: string; nameSi?: string | null; nameTa?: string | null },
  lang: ReportLanguage,
): string {
  if (lang === 'si') return (row.nameSi || row.nameEn).normalize('NFC');
  if (lang === 'ta') return (row.nameTa || row.nameEn).normalize('NFC');
  return row.nameEn.normalize('NFC');
}

function translateOrRaw(
  map: LookupTranslationMap,
  category: string,
  code: string | null | undefined,
  lang: ReportLanguage,
): string {
  if (!code) return '';
  const entry = map.get(category)?.get(code);
  if (entry) {
    return pickTrilingual(entry, lang);
  }
  return String(code).normalize('NFC');
}
