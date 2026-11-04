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

/**
 * Scans a ZIP / XLSX buffer to ensure total uncompressed size does not exceed maxBytes (zip bomb protection).
 */
export function checkZipDecompressedSize(
  buffer: Buffer,
  maxBytes: number = 50 * 1024 * 1024, // 50 MB
): void {
  if (
    !buffer ||
    buffer.length < 4 ||
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b ||
    buffer[2] !== 0x03 ||
    buffer[3] !== 0x04
  ) {
    return;
  }

  let eocdOffset = -1;
  const minEocdSize = 22;
  const maxSearch = Math.min(buffer.length, 65536 + minEocdSize);
  for (
    let i = buffer.length - minEocdSize;
    i >= buffer.length - maxSearch;
    i--
  ) {
    if (
      buffer[i] === 0x50 &&
      buffer[i + 1] === 0x4b &&
      buffer[i + 2] === 0x05 &&
      buffer[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }

  let totalUncompressedSize = 0;

  if (eocdOffset !== -1) {
    const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
    const cdEntries = buffer.readUInt16LE(eocdOffset + 10);
    let offset = cdOffset;

    for (let i = 0; i < cdEntries && offset + 46 <= buffer.length; i++) {
      if (
        buffer[offset] !== 0x50 ||
        buffer[offset + 1] !== 0x4b ||
        buffer[offset + 2] !== 0x01 ||
        buffer[offset + 3] !== 0x02
      ) {
        break;
      }
      const uncompressedSize = buffer.readUInt32LE(offset + 24);
      totalUncompressedSize += uncompressedSize;
      if (totalUncompressedSize > maxBytes) {
        throw new PayloadTooLargeException({
          code: 'UNZIP_SIZE_EXCEEDED',
          message: `Uncompressed spreadsheet size exceeds safe threshold of ${(maxBytes / (1024 * 1024)).toFixed(0)} MB.`,
        });
      }
      const fileNameLen = buffer.readUInt16LE(offset + 28);
      const extraLen = buffer.readUInt16LE(offset + 30);
      const commentLen = buffer.readUInt16LE(offset + 32);
      offset += 46 + fileNameLen + extraLen + commentLen;
    }
  } else {
    let offset = 0;
    while (offset + 30 <= buffer.length) {
      if (
        buffer[offset] === 0x50 &&
        buffer[offset + 1] === 0x4b &&
        buffer[offset + 2] === 0x03 &&
        buffer[offset + 3] === 0x04
      ) {
        const uncompressedSize = buffer.readUInt32LE(offset + 22);
        totalUncompressedSize += uncompressedSize;
        if (totalUncompressedSize > maxBytes) {
          throw new PayloadTooLargeException({
            code: 'UNZIP_SIZE_EXCEEDED',
            message: `Uncompressed spreadsheet size exceeds safe threshold of ${(maxBytes / (1024 * 1024)).toFixed(0)} MB.`,
          });
        }
        const fileNameLen = buffer.readUInt16LE(offset + 26);
        const extraLen = buffer.readUInt16LE(offset + 28);
        const compressedSize = buffer.readUInt32LE(offset + 18);
        offset += 30 + fileNameLen + extraLen;
        if (compressedSize > 0 && offset + compressedSize <= buffer.length) {
          offset += compressedSize;
        } else {
          offset += 1;
        }
      } else {
        offset += 1;
      }
    }
  }
}

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

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
  async previewImport(caller: ScopeContext, gnId: string, file?: any) {
    if (!file || !file.buffer) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'Spreadsheet or CSV file is required',
      });
    }

    // 4.5 MB cap check (enforce decimal 4,500,000 bytes so app reject precedes proxy upload errors)
    const MAX_SIZE_BYTES = 4.5 * 1000 * 1000;
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
        message:
          'CDC Secretary can only import house lists for their own GN division',
      });
    }

    // Prevent zip bomb decompression attacks by verifying uncompressed size
    checkZipDecompressedSize(file.buffer);

    // Parse with patched @e965/xlsx with UTF-8 codepage 65001 for non-BOM CSV and Sinhala/Tamil support
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(file.buffer, {
        type: 'buffer',
        cellDates: true,
        codepage: 65001,
      });
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

    // Maximum row cap to prevent memory exhaustion and serverless timeout
    const MAX_IMPORT_ROWS = 10000;
    const dataRowsCount = rawRows.length - 1;
    if (dataRowsCount > MAX_IMPORT_ROWS) {
      throw new BadRequestException({
        code: 'ROW_LIMIT_EXCEEDED',
        message: `File contains ${dataRowsCount} data rows, exceeding maximum limit of ${MAX_IMPORT_ROWS} rows per import batch.`,
      });
    }

    const normalizeHeader = (raw: any): string =>
      String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[\s\-_]+/g, '_');

    const normHeaders = (rawRows[0] || []).map(normalizeHeader);

    const matchHeader = (aliases: string[]): number => {
      const aliasSet = new Set(aliases.map(normalizeHeader));
      return normHeaders.findIndex((h: string) => aliasSet.has(h));
    };

    const houseNoIdx = matchHeader([
      'house_no',
      'houseno',
      'house_number',
      'house_num',
      'house',
      'ගෘහ_අංකය',
      'ගෘහ අංකය',
      'ගෘහ අංක',
      'வீட்டு எண்',
      'வீட்டு_எண்',
    ]);

    const headIdx = matchHeader([
      'house_leader_name',
      'household_head',
      'head_name',
      'house_head',
      'leader_name',
      'head',
      'leader',
      'ගෘහ_මූලික',
      'ගෘහ මූලිකයාගේ නම',
      'ගෘහ මූලික',
      'குடும்பத் தலைவர்',
      'குடும்பத்_தலைவர்',
    ]);

    const addrIdx = matchHeader([
      'address',
      'addr',
      'ලිපිනය',
      'ලිපින',
      'முகவரி',
    ]);

    const villageIdx = matchHeader([
      'village_name',
      'village',
      'street',
      'street_name',
      'ගම / වීදිය',
      'ගම',
      'ගම_වීදිය',
      'கிராமம் / வீதி',
      'கிராமம்',
      'கிராமம்_வீதி',
    ]);

    const aswesumaIdx = matchHeader([
      'aswesuma',
      'is_aswesuma',
      'අස්වැසුම',
      'அஸ்வெசும',
    ]);

    const etfIdx = matchHeader([
      'etf',
      'is_etf',
      'සේ.භා.අ',
      'සේභාඅ',
      'ஈ.டி.எப்',
      'ஈடிஎப்',
    ]);

    const epfIdx = matchHeader([
      'epf',
      'is_epf',
      'සේ.අ.අ',
      'සේඅඅ',
      'ஈ.பி.எப்',
      'ஈபிஎப்',
    ]);

    const samurdhiIdx = matchHeader([
      'samurdhi',
      'is_samurdhi',
      'සමෘද්ධි',
      'සමෘද්ධිය',
      'සමෘද්ධි_ලාභී',
      'சமுர்த்தி',
    ]);

    const specialIdx = matchHeader([
      'special_needs',
      'has_special_needs',
      'special',
      'special_need',
      'විශේෂ අවශ්‍යතා',
      'විශේෂ_අවශ්‍යතා',
      'විශේෂ',
      'விசேட தேவை',
      'விசேட_தேவை',
      'விசேட',
    ]);

    const targetFemaleIdx = matchHeader([
      'target_female',
      'female_target',
      'target_females',
      'female',
      'females',
      'කාන්තා ඉලක්කය',
      'කාන්තා_ඉලක්කය',
      'කාන්තා',
      'பெண் இலக்கு',
      'பெண்_இலக்கு',
      'பெண்',
    ]);

    const targetMaleIdx = matchHeader([
      'target_male',
      'male_target',
      'target_males',
      'male',
      'males',
      'පිරිමි ඉලක්කය',
      'පිරිමි_ඉලක්කය',
      'පිරිමි',
      'ஆண் இலக்கு',
      'ஆண்_இலக்கு',
      'ஆண்',
    ]);

    const ageGroupIdx = matchHeader([
      'age_group',
      'agegroup',
      'age_range',
      'age',
      'age_bracket',
      'වයස් කාණ්ඩය',
      'වයස්_කාණ්ඩය',
      'වයස් කාණ්ඩ',
      'වයස',
      'வயதுக் குழு',
      'வயது_குழு',
      'வயது குழு',
      'வயது',
    ]);

    const langSinhalaIdx = matchHeader([
      'lang_sinhala',
      'sinhala',
      'language_sinhala',
      'සිංහල',
      'සිංහල_භාෂාව',
      'சிங்களம்',
      'சிங்கள',
    ]);

    const langTamilIdx = matchHeader([
      'lang_tamil',
      'tamil',
      'language_tamil',
      'දෙමළ',
      'දෙමළ_භාෂාව',
      'தமிழ்',
      'தமிழ்_மொழி',
    ]);

    const langEnglishIdx = matchHeader([
      'lang_english',
      'english',
      'language_english',
      'ඉංග්‍රීසි',
      'ඉංග්‍රීසි_භාෂාව',
      'ஆங்கிலம்',
      'ஆங்கில',
    ]);

    const numMembersIdx = matchHeader([
      'num_members',
      'member_count',
      'members',
      'num_of_members',
      'number_of_members',
      'total_members',
      'සාමාජිකයින් සංඛ්‍යාව',
      'සාමාජික_ගණන',
      'සාමාජිකයින්',
      'සාමාජික',
      'உறுப்பினர்கள் எண்ணிக்கை',
      'உறுப்பினர்',
    ]);

    if (houseNoIdx === -1 || headIdx === -1) {
      throw new BadRequestException({
        code: 'MISSING_REQUIRED_HEADERS',
        message:
          'Invalid headers: File must contain "house_no" and "house_leader_name" columns.',
      });
    }

    // Fetch existing house_no_norm in target GN division (deletedAt: null) for duplicate check
    const existingDbHouseholds = await this.prisma.household.findMany({
      where: { gnId, deletedAt: null },
      select: { houseNo: true, houseNoNorm: true },
    });
    const existingNormSet = new Set(
      existingDbHouseholds.map((h) => h.houseNoNorm),
    );

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
        cols.every(
          (c) => c === undefined || c === null || String(c).trim() === '',
        )
      ) {
        continue;
      }

      const rowNo = i + 1;
      const rowErrors: string[] = [];

      // Cell strings: do NOT strip quotes from content!
      const rawHouseNo = String(cols[houseNoIdx] ?? '').trim();
      const rawHeadName = String(cols[headIdx] ?? '').trim();
      const rawAddress =
        addrIdx !== -1 ? String(cols[addrIdx] ?? '').trim() : '';
      const rawVillage =
        villageIdx !== -1 ? String(cols[villageIdx] ?? '').trim() : '';

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
        message:
          'CDC Secretary can only confirm batches for their assigned GN division',
      });
    }

    if (batch.status === 'committed') {
      throw new ConflictException({
        code: 'IMPORT_ALREADY_COMMITTED',
        message: 'This import batch has already been confirmed and committed.',
      });
    }

    const BATCH_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours preview expiry
    const isBatchExpired =
      Date.now() - new Date(batch.importedAt).getTime() > BATCH_EXPIRY_MS;
    if (batch.status === 'expired' || isBatchExpired) {
      if (batch.status !== 'expired') {
        await this.prisma.importBatch.update({
          where: { id: batchId },
          data: { status: 'expired' },
        });
      }
      throw new BadRequestException({
        code: 'IMPORT_BATCH_EXPIRED',
        message:
          'This previewed import batch has expired and can no longer be confirmed. Please re-upload.',
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
        // 0. Take row-level lock on import_batches to serialize concurrent confirms and prevent corruption
        const batchRows = await tx.$queryRawUnsafe<
          Array<{
            id: string;
            gn_id: string;
            status: string;
            imported_at: Date;
            rows_total: number;
          }>
        >(
          `SELECT id, gn_id, status, imported_at, rows_total FROM import_batches WHERE id = $1::uuid FOR UPDATE`,
          batchId,
        );

        const lockedBatch = batchRows?.[0];
        if (!lockedBatch) {
          throw new NotFoundException({
            code: 'IMPORT_BATCH_NOT_FOUND',
            message: 'Import batch not found',
          });
        }

        // Re-check status inside transaction under row lock
        if (lockedBatch.status === 'committed') {
          throw new ConflictException({
            code: 'IMPORT_ALREADY_COMMITTED',
            message:
              'This import batch has already been confirmed and committed.',
          });
        }

        const isLockedExpired =
          Date.now() - new Date(lockedBatch.imported_at).getTime() >
          BATCH_EXPIRY_MS;
        if (lockedBatch.status === 'expired' || isLockedExpired) {
          if (lockedBatch.status !== 'expired') {
            await tx.importBatch.update({
              where: { id: batchId },
              data: { status: 'expired' },
            });
          }
          throw new BadRequestException({
            code: 'IMPORT_BATCH_EXPIRED',
            message:
              'This previewed import batch has expired and can no longer be confirmed. Please re-upload.',
          });
        }

        // 1. Take row-level lock on gn_divisions to serialize serial allocation
        const gnRows = await tx.$queryRawUnsafe<Array<{ next_serial: number }>>(
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

        const householdsToCreate: any[] = [];
        for (const row of validRows) {
          const d = row.data as any;
          if (conflictNormSet.has(d.houseNoNorm)) {
            skippedConflictCount++;
            continue;
          }

          householdsToCreate.push({
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
          });
        }

        if (householdsToCreate.length > 0) {
          await tx.household.createMany({
            data: householdsToCreate,
          });
        }
        committedCount = householdsToCreate.length;

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
          skippedCount:
            skippedConflictCount + (batch.rowsTotal - validRows.length),
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
        message:
          'CDC Secretary can only view batches for their assigned GN division',
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
  async getErrorReportCsv(
    caller: ScopeContext,
    batchId: string,
  ): Promise<string> {
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

    const headers = [
      'Row_Number',
      'House_No',
      'Head_Name',
      'Address',
      'Error_Reason',
    ];
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
        const errs = Array.isArray(r.errors)
          ? (r.errors as string[]).join('; ')
          : 'Validation error';
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
