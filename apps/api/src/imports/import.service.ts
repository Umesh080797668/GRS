import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/scope/scope.types';
import type { ScopeContext } from '../common/scope/scope.types';
import { GrsValidators } from '../common/validators/grs-validators';
import * as XLSX from '@e965/xlsx';

export interface StagingRowPayload {
  rowNo: number;
  data: Record<string, any>;
  errors: string[];
  isValid: boolean;
}

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) { }

  /**
   * Helper to parse boolean cell per Technical Blueprint & Plan §13:
   * Accepts yes/no/y/n/true/false/1/0, ඔව්/නැත, ஆம்/இல்லை.
   * Anything else is a row error, never silently false.
   */
  private parseBooleanCell(
    val: any,
    fieldName: string,
  ): { isValid: boolean; value: boolean; error?: string } {
    if (val === undefined || val === null || val === '') {
      return { isValid: true, value: false };
    }
    const str = String(val).trim().toLowerCase();
    if (['yes', 'y', 'true', '1', 'ඔව්', 'ஆம்'].includes(str)) {
      return { isValid: true, value: true };
    }
    if (['no', 'n', 'false', '0', 'නැත', 'இல்லை'].includes(str)) {
      return { isValid: true, value: false };
    }
    return {
      isValid: false,
      value: false,
      error: `Invalid boolean value "${val}" for ${fieldName}. Allowed: yes/no, ඔව්/නැත, ஆம்/இல்லை.`,
    };
  }

  /**
   * Parse target whole number (0..99).
   */
  private parseTarget(
    val: any,
    fieldName: string,
  ): { isValid: boolean; value: number; error?: string } {
    if (val === undefined || val === null || val === '') {
      return { isValid: true, value: 0 };
    }
    const num = Number(String(val).trim());
    if (isNaN(num) || !Number.isInteger(num) || num < 0 || num > 99) {
      return {
        isValid: false,
        value: 0,
        error: `Invalid ${fieldName} "${val}". Must be an integer between 0 and 99.`,
      };
    }
    return { isValid: true, value: num };
  }

  /**
   * Parse age group range e.g. "18-25", "18–25", or single age "18".
   */
  private parseAgeGroup(val: any): {
    isValid: boolean;
    min?: number;
    max?: number;
    error?: string;
  } {
    if (val === undefined || val === null || val === '') {
      return { isValid: true };
    }
    const s = String(val).trim();
    const rangeMatch = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(s);
    if (rangeMatch) {
      const min = parseInt(rangeMatch[1], 10);
      const max = parseInt(rangeMatch[2], 10);
      if (min < 1 || max > 120 || min > max) {
        return {
          isValid: false,
          error: `Invalid age group range "${s}". Must be between 1 and 120 (min <= max).`,
        };
      }
      return { isValid: true, min, max };
    }
    const singleMatch = /^(\d+)$/.exec(s);
    if (singleMatch) {
      const age = parseInt(singleMatch[1], 10);
      if (age < 1 || age > 120) {
        return {
          isValid: false,
          error: `Invalid age "${s}". Must be between 1 and 120.`,
        };
      }
      return { isValid: true, min: age, max: age };
    }
    return {
      isValid: false,
      error: `Invalid age group format "${s}". Expected format like "18-25".`,
    };
  }

  /**
   * Parse number of members (1..99).
   */
  private parseNumMembers(val: any): {
    isValid: boolean;
    value?: number;
    error?: string;
  } {
    if (val === undefined || val === null || val === '') {
      return { isValid: true };
    }
    const num = Number(String(val).trim());
    if (isNaN(num) || !Number.isInteger(num) || num < 1 || num > 99) {
      return {
        isValid: false,
        error: `Invalid num_members "${val}". Must be an integer between 1 and 99.`,
      };
    }
    return { isValid: true, value: num };
  }

  /**
   * POST /v1/imports/preview
   * Upload file (<4.5 MB), parse server-side with patched library, store in import_staging.
   */
  async previewImport(
    caller: ScopeContext,
    gnId: string,
    file?: any,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'Spreadsheet or CSV file is required',
      });
    }

    // 4.5 MB cap check
    const MAX_SIZE_BYTES = 4.5 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      throw new PayloadTooLargeException({
        code: 'IMPORT_TOO_LARGE',
        message: `File size ${(file.size / (1024 * 1024)).toFixed(2)} MB exceeds maximum 4.5 MB upload threshold.`,
      });
    }

    // Verify GN division and scope
    const gn = await this.prisma.gnDivision.findUnique({
      where: { id: gnId },
      include: { ds: true },
    });
    if (!gn) {
      throw new NotFoundException({
        code: 'GN_NOT_FOUND',
        message: 'Designated GN division not found',
      });
    }

    if (caller.role === UserRole.cdc_secretary && caller.gnId !== gnId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_SCOPE',
        message: 'CDC Secretary can only import house lists for their own GN division',
      });
    }

    // Parse with patched @e965/xlsx
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
    } catch (err: any) {
      throw new BadRequestException({
        code: 'INVALID_FILE_FORMAT',
        message: `Failed to parse file: ${err.message}`,
      });
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new BadRequestException({
        code: 'EMPTY_WORKBOOK',
        message: 'Workbook contains no sheets',
      });
    }

    const sheet = workbook.Sheets[firstSheetName];
    // raw: false reads formatted cell strings, preserving internal quotes without strip
    const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });

    if (!rawRows || rawRows.length < 2) {
      throw new BadRequestException({
        code: 'INVALID_ROW_COUNT',
        message: 'File must contain at least a header row and one data row',
      });
    }

    const headers = (rawRows[0] || []).map((h: any) =>
      String(h || '').trim().toLowerCase(),
    );

    const houseNoIdx = headers.findIndex(
      (h: string) =>
        h === 'house_no' ||
        h === 'houseno' ||
        h === 'house_number' ||
        h.includes('house') ||
        h.includes('ගෘහ අංක') ||
        h.includes('வீட்டு எண்'),
    );

    const headIdx = headers.findIndex(
      (h: string) =>
        h === 'house_leader_name' ||
        h === 'household_head' ||
        h === 'head_name' ||
        h.includes('head') ||
        h.includes('leader') ||
        h.includes('ගෘහ මූලික') ||
        h.includes('குடும்பத் தலைவர்'),
    );

    const addrIdx = headers.findIndex(
      (h: string) => h.includes('addr') || h.includes('ලිපින') || h.includes('முகவரி'),
    );

    const villageIdx = headers.findIndex(
      (h: string) => h.includes('village') || h.includes('street') || h.includes('ගම') || h.includes('கிராமம்'),
    );

    const aswesumaIdx = headers.findIndex(
      (h: string) => h.includes('aswesuma') || h.includes('අස්වැසුම') || h.includes('அஸ்வெசும'),
    );

    const etfIdx = headers.findIndex(
      (h: string) => h === 'etf' || h.includes('සේ.භා.අ') || h.includes('ஈ.டி.எப்'),
    );

    const epfIdx = headers.findIndex(
      (h: string) => h === 'epf' || h.includes('සේ.අ.අ') || h.includes('ஈ.பி.எப்'),
    );

    const samurdhiIdx = headers.findIndex(
      (h: string) => h.includes('samurdhi') || h.includes('සමෘද්ධි') || h.includes('சமுர்த்தி'),
    );

    const specialIdx = headers.findIndex(
      (h: string) => h.includes('special') || h.includes('විශේෂ') || h.includes('விசேட'),
    );

    const targetFemaleIdx = headers.findIndex(
      (h: string) =>
        h.includes('target_female') ||
        h.includes('female_target') ||
        h.includes('female') ||
        h.includes('කාන්තා') ||
        h.includes('பெண்'),
    );

    const targetMaleIdx = headers.findIndex(
      (h: string) =>
        h.includes('target_male') ||
        h.includes('male_target') ||
        (h.includes('male') && !h.includes('female')) ||
        h.includes('පිරිමි') ||
        h.includes('ஆண்'),
    );

    const ageGroupIdx = headers.findIndex(
      (h: string) => h.includes('age') || h.includes('වයස්') || h.includes('வயது'),
    );

    const langSinhalaIdx = headers.findIndex(
      (h: string) => h.includes('sinhala') || h.includes('සිංහල') || h.includes('சிங்கள'),
    );

    const langTamilIdx = headers.findIndex(
      (h: string) => h.includes('tamil') || h.includes('දෙමළ') || h.includes('தமிழ்'),
    );

    const langEnglishIdx = headers.findIndex(
      (h: string) => h.includes('english') || h.includes('ඉංග්‍රීසි') || h.includes('ஆங்கில'),
    );

    const numMembersIdx = headers.findIndex(
      (h: string) => h.includes('member') || h.includes('සාමාජික') || h.includes('உறுப்பினர்'),
    );

    if (houseNoIdx === -1 || headIdx === -1) {
      throw new BadRequestException({
        code: 'MISSING_REQUIRED_HEADERS',
        message: 'Invalid headers: File must contain "house_no" and "house_leader_name" columns.',
      });
    }

    // Fetch existing house_no_norm in target GN division (deletedAt: null) for duplicate check
    const existingDbHouseholds = await this.prisma.household.findMany({
      where: { gnId, deletedAt: null },
      select: { houseNo: true, houseNoNorm: true },
    });
    const existingNormSet = new Set(existingDbHouseholds.map((h) => h.houseNoNorm));

    const seenNormsInFile = new Set<string>();
    const stagingPayloads: StagingRowPayload[] = [];

    let rowsOk = 0;
    let rowsFailed = 0;

    for (let i = 1; i < rawRows.length; i++) {
      const cols = rawRows[i];
      // Skip empty rows
      if (
        !cols ||
        cols.length === 0 ||
        cols.every((c) => c === undefined || c === null || String(c).trim() === '')
      ) {
        continue;
      }

      const rowNo = i + 1;
      const rowErrors: string[] = [];

      // Cell strings: do NOT strip quotes from content!
      const rawHouseNo = String(cols[houseNoIdx] ?? '').trim();
      const rawHeadName = String(cols[headIdx] ?? '').trim();
      const rawAddress = addrIdx !== -1 ? String(cols[addrIdx] ?? '').trim() : '';
      const rawVillage = villageIdx !== -1 ? String(cols[villageIdx] ?? '').trim() : '';

      // Validate House Number & Normalization
      let houseNoNorm = '';
      if (!rawHouseNo) {
        rowErrors.push('Missing House Number.');
      } else {
        const normResult = GrsValidators.normalizeHouseNo(rawHouseNo);
        if (!normResult.isValid || !normResult.value) {
          rowErrors.push(`Invalid house number format "${rawHouseNo}".`);
        } else {
          houseNoNorm = normResult.value;
          // Duplicate check within file
          if (seenNormsInFile.has(houseNoNorm)) {
            rowErrors.push(
              `Duplicate House Number "${rawHouseNo}" (normalized: "${houseNoNorm}") detected within file.`,
            );
          } else {
            seenNormsInFile.add(houseNoNorm);
          }

          // Duplicate check against database
          if (existingNormSet.has(houseNoNorm)) {
            rowErrors.push(
              `House Number "${rawHouseNo}" (normalized: "${houseNoNorm}") already exists in this GN division.`,
            );
          }
        }
      }

      // Validate Head Name
      if (!rawHeadName) {
        rowErrors.push('Missing Household Head Name.');
      }

      // Parse Welfare booleans
      const aswesumaRes = this.parseBooleanCell(
        aswesumaIdx !== -1 ? cols[aswesumaIdx] : undefined,
        'aswesuma',
      );
      if (!aswesumaRes.isValid) rowErrors.push(aswesumaRes.error!);

      const etfRes = this.parseBooleanCell(
        etfIdx !== -1 ? cols[etfIdx] : undefined,
        'etf',
      );
      if (!etfRes.isValid) rowErrors.push(etfRes.error!);

      const epfRes = this.parseBooleanCell(
        epfIdx !== -1 ? cols[epfIdx] : undefined,
        'epf',
      );
      if (!epfRes.isValid) rowErrors.push(epfRes.error!);

      const samurdhiRes = this.parseBooleanCell(
        samurdhiIdx !== -1 ? cols[samurdhiIdx] : undefined,
        'samurdhi',
      );
      if (!samurdhiRes.isValid) rowErrors.push(samurdhiRes.error!);

      const specialRes = this.parseBooleanCell(
        specialIdx !== -1 ? cols[specialIdx] : undefined,
        'special_needs',
      );
      if (!specialRes.isValid) rowErrors.push(specialRes.error!);

      // Parse Targets
      const targetFemaleRes = this.parseTarget(
        targetFemaleIdx !== -1 ? cols[targetFemaleIdx] : undefined,
        'target_female',
      );
      if (!targetFemaleRes.isValid) rowErrors.push(targetFemaleRes.error!);

      const targetMaleRes = this.parseTarget(
        targetMaleIdx !== -1 ? cols[targetMaleIdx] : undefined,
        'target_male',
      );
      if (!targetMaleRes.isValid) rowErrors.push(targetMaleRes.error!);

      // Parse Age Group
      const ageGroupRes = this.parseAgeGroup(
        ageGroupIdx !== -1 ? cols[ageGroupIdx] : undefined,
      );
      if (!ageGroupRes.isValid) rowErrors.push(ageGroupRes.error!);

      // Parse Languages
      const langSinhalaRes = this.parseBooleanCell(
        langSinhalaIdx !== -1 ? cols[langSinhalaIdx] : undefined,
        'lang_sinhala',
      );
      if (!langSinhalaRes.isValid) rowErrors.push(langSinhalaRes.error!);

      const langTamilRes = this.parseBooleanCell(
        langTamilIdx !== -1 ? cols[langTamilIdx] : undefined,
        'lang_tamil',
      );
      if (!langTamilRes.isValid) rowErrors.push(langTamilRes.error!);

      const langEnglishRes = this.parseBooleanCell(
        langEnglishIdx !== -1 ? cols[langEnglishIdx] : undefined,
        'lang_english',
      );
      if (!langEnglishRes.isValid) rowErrors.push(langEnglishRes.error!);

      // Parse Num Members
      const numMembersRes = this.parseNumMembers(
        numMembersIdx !== -1 ? cols[numMembersIdx] : undefined,
      );
      if (!numMembersRes.isValid) rowErrors.push(numMembersRes.error!);

      const isValid = rowErrors.length === 0;
      if (isValid) {
        rowsOk++;
      } else {
        rowsFailed++;
      }

      stagingPayloads.push({
        rowNo,
        isValid,
        errors: rowErrors,
        data: {
          houseNo: rawHouseNo,
          houseNoNorm,
          headName: rawHeadName,
          address: rawAddress,
          villageName: rawVillage,
          isAswesuma: aswesumaRes.value,
          isEtf: etfRes.value,
          isEpf: epfRes.value,
          isSamurdhi: samurdhiRes.value,
          hasSpecialNeeds: specialRes.value,
          targetFemale: targetFemaleRes.value,
          targetMale: targetMaleRes.value,
          ageGroupMin: ageGroupRes.min ?? null,
          ageGroupMax: ageGroupRes.max ?? null,
          langSinhala: langSinhalaRes.value,
          langTamil: langTamilRes.value,
          langEnglish: langEnglishRes.value,
          numMembers: numMembersRes.value ?? null,
        },
      });
    }

    if (stagingPayloads.length === 0) {
      throw new BadRequestException({
        code: 'NO_DATA_ROWS',
        message: 'File contains no valid data rows to import',
      });
    }

    // Save batch and staging rows atomically in DB
    const batch = await this.prisma.$transaction(async (tx) => {
      const createdBatch = await tx.importBatch.create({
        data: {
          gnId,
          fileName: file.originalname,
          rowsTotal: stagingPayloads.length,
          rowsOk,
          rowsFailed,
          status: 'previewed',
          importedBy: caller.userId,
        },
      });

      await tx.importStaging.createMany({
        data: stagingPayloads.map((p) => ({
          batchId: createdBatch.id,
          rowNo: p.rowNo,
          data: p.data,
          errors: p.errors,
        })),
      });

      return createdBatch;
    });

    return {
      batchId: batch.id,
      fileName: batch.fileName,
      gnId: batch.gnId,
      status: batch.status,
      rowsTotal: batch.rowsTotal,
      rowsOk: batch.rowsOk,
      rowsFailed: batch.rowsFailed,
      importedAt: batch.importedAt,
      rows: stagingPayloads,
    };
  }

  /**
   * POST /v1/imports/:id/confirm
   * Commits valid rows from import_staging into households table in one atomic transaction.
   * Re-validates duplicates at commit time to prevent race conditions.
   */
  async confirmImport(caller: ScopeContext, batchId: string) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException({
        code: 'IMPORT_BATCH_NOT_FOUND',
        message: 'Import batch not found',
      });
    }

    if (caller.role === UserRole.cdc_secretary && caller.gnId !== batch.gnId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_SCOPE',
        message: 'CDC Secretary can only confirm batches for their assigned GN division',
      });
    }

    if (batch.status === 'committed') {
      throw new ConflictException({
        code: 'IMPORT_ALREADY_COMMITTED',
        message: 'This import batch has already been confirmed and committed.',
      });
    }

    const stagingRows = await this.prisma.importStaging.findMany({
      where: { batchId },
      orderBy: { rowNo: 'asc' },
    });

    // Valid rows only (where errors array is empty)
    const validRows = stagingRows.filter(
      (r) => Array.isArray(r.errors) && r.errors.length === 0,
    );

    if (validRows.length === 0) {
      throw new BadRequestException({
        code: 'NO_VALID_ROWS',
        message: 'There are no valid rows to commit in this batch.',
      });
    }

    const gn = await this.prisma.gnDivision.findUnique({
      where: { id: batch.gnId },
      include: { ds: true },
    });

    if (!gn) {
      throw new NotFoundException({
        code: 'GN_NOT_FOUND',
        message: 'Designated GN division not found',
      });
    }

    // Atomic transaction committing valid rows
    return await this.prisma.$transaction(
      async (tx) => {
        // 1. Take row-level lock on gn_divisions to serialize serial allocation
        const gnRows = await tx.$queryRawUnsafe<
          Array<{ next_serial: number }>
        >(
          `SELECT next_serial FROM gn_divisions WHERE id = $1::uuid FOR UPDATE`,
          batch.gnId,
        );
        let allocatedSerial = gnRows[0]?.next_serial ?? 1;

        // 2. Re-validate duplicate check against database under row lock
        const candidateNorms = validRows.map(
          (r) => (r.data as any).houseNoNorm,
        );
        const existingConflictingHouses = await tx.household.findMany({
          where: {
            gnId: batch.gnId,
            deletedAt: null,
            houseNoNorm: { in: candidateNorms },
          },
          select: { houseNoNorm: true },
        });
        const conflictNormSet = new Set(
          existingConflictingHouses.map((h) => h.houseNoNorm),
        );

        let committedCount = 0;
        let skippedConflictCount = 0;

        for (const row of validRows) {
          const d = row.data as any;
          if (conflictNormSet.has(d.houseNoNorm)) {
            skippedConflictCount++;
            continue;
          }

          await tx.household.create({
            data: {
              gnId: batch.gnId,
              districtId: gn.ds.districtId,
              dsId: gn.dsId,
              serialNo: allocatedSerial++,
              houseNo: d.houseNo,
              houseNoNorm: d.houseNoNorm,
              houseLeaderName: d.headName,
              address: d.address || null,
              villageName: d.villageName || null,
              isEpf: Boolean(d.isEpf),
              isEtf: Boolean(d.isEtf),
              isAswesuma: Boolean(d.isAswesuma),
              isSamurdhi: Boolean(d.isSamurdhi),
              hasSpecialNeeds: Boolean(d.hasSpecialNeeds),
              targetFemale: Number(d.targetFemale) || 0,
              targetMale: Number(d.targetMale) || 0,
              ageGroupMin: d.ageGroupMin ?? null,
              ageGroupMax: d.ageGroupMax ?? null,
              langSinhala: Boolean(d.langSinhala),
              langTamil: Boolean(d.langTamil),
              langEnglish: Boolean(d.langEnglish),
              importBatchId: batch.id,
              createdBy: caller.userId,
              visitStatus: 'not_started',
            },
          });
          committedCount++;
        }

        // Update gn next_serial
        await tx.gnDivision.update({
          where: { id: batch.gnId },
          data: { nextSerial: allocatedSerial },
        });

        // Update batch status
        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            status: 'committed',
            rowsOk: committedCount,
            rowsFailed: batch.rowsTotal - committedCount,
          },
        });

        return {
          batchId: batch.id,
          status: 'committed',
          committedCount,
          skippedCount: skippedConflictCount + (batch.rowsTotal - validRows.length),
        };
      },
      { timeout: 60000 },
    );
  }

  /**
   * GET /v1/imports/:id
   */
  async getImportBatch(caller: ScopeContext, batchId: string) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
      include: {
        stagingRows: {
          orderBy: { rowNo: 'asc' },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException({
        code: 'IMPORT_BATCH_NOT_FOUND',
        message: 'Import batch not found',
      });
    }

    if (caller.role === UserRole.cdc_secretary && caller.gnId !== batch.gnId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_SCOPE',
        message: 'CDC Secretary can only view batches for their assigned GN division',
      });
    }

    return {
      batchId: batch.id,
      gnId: batch.gnId,
      fileName: batch.fileName,
      status: batch.status,
      rowsTotal: batch.rowsTotal,
      rowsOk: batch.rowsOk,
      rowsFailed: batch.rowsFailed,
      importedAt: batch.importedAt,
      rows: batch.stagingRows.map((r) => ({
        rowNo: r.rowNo,
        isValid: Array.isArray(r.errors) && r.errors.length === 0,
        errors: r.errors,
        data: r.data,
      })),
    };
  }

  /**
   * GET /v1/imports/:id/errors
   * Download sanitized CSV error report for a batch.
   */
  async getErrorReportCsv(caller: ScopeContext, batchId: string): Promise<string> {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
      include: {
        stagingRows: {
          orderBy: { rowNo: 'asc' },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException({
        code: 'IMPORT_BATCH_NOT_FOUND',
        message: 'Import batch not found',
      });
    }

    const errorRows = batch.stagingRows.filter(
      (r) => Array.isArray(r.errors) && r.errors.length > 0,
    );

    const headers = ['Row_Number', 'House_No', 'Head_Name', 'Address', 'Error_Reason'];
    const escapeCsv = (str: any) => {
      if (str === null || str === undefined) return '""';
      let s = String(str);
      if (
        s.startsWith('=') ||
        s.startsWith('+') ||
        s.startsWith('-') ||
        s.startsWith('@') ||
        s.startsWith('\t') ||
        s.startsWith('\r')
      ) {
        s = `'${s}`;
      }
      return `"${s.replace(/"/g, '""')}"`;
    };

    const lines = [
      headers.join(','),
      ...errorRows.map((r) => {
        const d = r.data as any;
        const errs = Array.isArray(r.errors) ? (r.errors as string[]).join('; ') : 'Validation error';
        return [
          r.rowNo,
          escapeCsv(d?.houseNo || ''),
          escapeCsv(d?.headName || ''),
          escapeCsv(d?.address || ''),
          escapeCsv(errs),
        ].join(',');
      }),
    ];

    return lines.join('\n');
  }

  /**
   * GET /v1/imports/template
   * Official CSV template per Appendix B with trilingual sample rows.
   */
  getTemplateCsv(lang = 'en'): string {
    const headers = [
      'house_no',
      'house_leader_name',
      'address',
      'village_name',
      'aswesuma',
      'etf',
      'epf',
      'samurdhi',
      'special_needs',
      'target_female',
      'target_male',
      'age_group',
      'lang_sinhala',
      'lang_tamil',
      'lang_english',
      'num_members',
    ].join(',');

    const sampleRows = [
      '102/B,Sunil Perera,No. 102/B Kandy Road,Pallekele,yes,no,yes,no,no,2,1,18-35,yes,no,yes,4',
      '104,කමල් සිරිවර්ධන,ප්‍රධාන වීදිය,නුවර,ඔව්,නැත,ඔව්,නැත,නැත,1,2,18-25,ඔව්,නැත,නැත,5',
      '105/A,கமலேஸ்வரன்,கோயில் வீதி,யாழ்ப்பாணம்,ஆம்,இல்லை,ஆம்,இல்லை,ஆம்,0,2,20-40,இல்லை,ஆம்,இல்லை,3',
    ].join('\n');

    return `${headers}\n${sampleRows}\n`;
  }
}
