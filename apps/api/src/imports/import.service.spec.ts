import { Test, TestingModule } from '@nestjs/testing';
import { ImportService } from './import.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/scope/scope.types';
import * as XLSX from '@e965/xlsx';

describe('ImportService', () => {
  let service: ImportService;
  let prisma: any;

  const mockAdminCaller = {
    userId: 'admin-uuid-1',
    role: UserRole.super_admin,
  };

  const mockCdcCaller = {
    userId: 'cdc-uuid-1',
    role: UserRole.cdc_secretary,
    gnId: 'gn-uuid-1',
  };

  const mockGn = {
    id: 'gn-uuid-1',
    nameEn: 'Pallekele North',
    nextSerial: 10,
    dsId: 'ds-uuid-1',
    ds: {
      id: 'ds-uuid-1',
      districtId: 'district-uuid-1',
    },
  };

  beforeEach(async () => {
    prisma = {
      gnDivision: {
        findUnique: jest.fn().mockResolvedValue(mockGn),
        update: jest.fn().mockResolvedValue(mockGn),
      },
      household: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'h-1', ...data })),
        createMany: jest.fn().mockImplementation(({ data }) => Promise.resolve({ count: data.length })),
      },
      importBatch: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'batch-uuid-1', ...data, importedAt: new Date() }),
        ),
        findUnique: jest.fn().mockImplementation(() =>
          Promise.resolve({
            id: 'batch-uuid-1',
            gnId: 'gn-uuid-1',
            status: 'previewed',
            rowsTotal: 3,
            fileName: 'test.xlsx',
            importedAt: new Date(),
          }),
        ),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'batch-uuid-1', ...data })),
      },
      importStaging: {
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
      $queryRawUnsafe: jest.fn().mockImplementation((query: string) => {
        if (typeof query === 'string' && query.includes('import_batches')) {
          return Promise.resolve([
            {
              id: 'batch-uuid-1',
              gn_id: 'gn-uuid-1',
              status: 'previewed',
              imported_at: new Date(),
              rows_total: 3,
            },
          ]);
        }
        return Promise.resolve([{ next_serial: 10 }]);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ImportService>(ImportService);
  });

  describe('previewImport', () => {
    it('correctly parses Sinhala and Tamil Yes/No values and does not strip quotes', async () => {
      // Build test workbook with Sinhala, Tamil, English rows, and quotes in text
      const wb = XLSX.utils.book_new();
      const rows = [
        ['house_no', 'house_leader_name', 'address', 'aswesuma', 'etf', 'epf', 'samurdhi', 'special_needs', 'target_female', 'target_male', 'age_group', 'lang_sinhala', 'lang_tamil', 'lang_english', 'num_members'],
        ['102/B', 'Sunil "The Leader" Perera', 'No. "102" Kandy Rd', 'yes', 'no', '1', '0', 'true', '2', '1', '18-35', 'yes', 'no', 'yes', '4'],
        ['104', 'කමල් "විශේෂ" සිරිවර්ධන', 'ප්‍රධාන වීදිය', 'ඔව්', 'නැත', 'ඔව්', 'නැත', 'නැත', '1', '2', '18-25', 'ඔව්', 'නැත', 'නැත', '5'],
        ['105/A', 'கமலேஸ்வரன்', 'கோயில் வீதி', 'ஆம்', 'இல்லை', 'ஆம்', 'இல்லை', 'ஆம்', '0', '2', '20-40', 'இல்லை', 'ஆம்', 'இல்லை', '3'],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const file = {
        originalname: 'test_trilingual.xlsx',
        buffer: buf,
        size: buf.length,
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };

      const result = await service.previewImport(mockCdcCaller as any, 'gn-uuid-1', file);

      expect(result.rowsTotal).toBe(3);
      expect(result.rowsOk).toBe(3);
      expect(result.rowsFailed).toBe(0);

      // Verify row 1: English booleans + quotes preserved
      const r1 = result.rows[0];
      expect(r1.isValid).toBe(true);
      expect(r1.data.headName).toBe('Sunil "The Leader" Perera');
      expect(r1.data.address).toBe('No. "102" Kandy Rd');
      expect(r1.data.isAswesuma).toBe(true);
      expect(r1.data.isEtf).toBe(false);
      expect(r1.data.isEpf).toBe(true);
      expect(r1.data.isSamurdhi).toBe(false);
      expect(r1.data.hasSpecialNeeds).toBe(true);
      expect(r1.data.langSinhala).toBe(true);
      expect(r1.data.langTamil).toBe(false);

      // Verify row 2: Sinhala booleans "ඔව්" / "නැත"
      const r2 = result.rows[1];
      expect(r2.isValid).toBe(true);
      expect(r2.data.isAswesuma).toBe(true);
      expect(r2.data.isEtf).toBe(false);
      expect(r2.data.isEpf).toBe(true);
      expect(r2.data.langSinhala).toBe(true);
      expect(r2.data.headName).toBe('කමල් "විශේෂ" සිරිවර්ධන');

      // Verify row 3: Tamil booleans "ஆம்" / "இல்லை"
      const r3 = result.rows[2];
      expect(r3.isValid).toBe(true);
      expect(r3.data.isAswesuma).toBe(true);
      expect(r3.data.isEtf).toBe(false);
      expect(r3.data.isEpf).toBe(true);
      expect(r3.data.langTamil).toBe(true);
    });

    it('correctly matches official template with village_name column without misidentifying it as age_group', async () => {
      const templateHeaders = [
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
      ];
      const rows = [
        templateHeaders,
        ['10/A', 'Perera Silva', 'Main St', 'Pallekele', 'yes', 'no', 'yes', 'no', 'no', '1', '1', '18-35', 'yes', 'no', 'no', '3'],
      ];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'TemplateTest');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const file = {
        originalname: 'official_template.xlsx',
        buffer: buf,
        size: buf.length,
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };

      const result = await service.previewImport(mockCdcCaller as any, 'gn-uuid-1', file);
      expect(result.rowsTotal).toBe(1);
      expect(result.rowsOk).toBe(1);
      expect(result.rowsFailed).toBe(0);
      expect(result.rows[0].isValid).toBe(true);
      expect(result.rows[0].data.villageName).toBe('Pallekele');
      expect(result.rows[0].data.ageGroupMin).toBe(18);
      expect(result.rows[0].data.ageGroupMax).toBe(35);
    });

    it('rejects invalid boolean values with row errors instead of silently treating as false', async () => {
      const wb = XLSX.utils.book_new();
      const rows = [
        ['house_no', 'house_leader_name', 'aswesuma'],
        ['101', 'Test Person', 'maybe'], // invalid boolean
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const file = {
        originalname: 'invalid_bool.xlsx',
        buffer: buf,
        size: buf.length,
      };

      const result = await service.previewImport(mockAdminCaller as any, 'gn-uuid-1', file);
      expect(result.rowsFailed).toBe(1);
      expect(result.rows[0].isValid).toBe(false);
      expect(result.rows[0].errors[0]).toContain('Invalid boolean value "maybe" for aswesuma');
    });

    it('detects duplicates using normalized house_no_norm (e.g. 025 and 25, or 25 a and 25/A)', async () => {
      const wb = XLSX.utils.book_new();
      const rows = [
        ['house_no', 'house_leader_name'],
        ['025', 'Person One'],
        ['25', 'Person Two'], // Same normalized house number!
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const file = {
        originalname: 'duplicates.xlsx',
        buffer: buf,
        size: buf.length,
      };

      const result = await service.previewImport(mockAdminCaller as any, 'gn-uuid-1', file);
      expect(result.rows[0].isValid).toBe(true);
      expect(result.rows[1].isValid).toBe(false);
      expect(result.rows[1].errors[0]).toContain('Duplicate House Number "25" (normalized: "25") detected within file');
    });

    it('detects duplicates against existing database records using house_no_norm', async () => {
      prisma.household.findMany.mockResolvedValue([
        { houseNo: '045/A', houseNoNorm: '45/A' },
      ]);

      const wb = XLSX.utils.book_new();
      const rows = [
        ['house_no', 'house_leader_name'],
        ['45/A', 'Already In DB'],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const file = {
        originalname: 'db_dup.xlsx',
        buffer: buf,
        size: buf.length,
      };

      const result = await service.previewImport(mockAdminCaller as any, 'gn-uuid-1', file);
      expect(result.rows[0].isValid).toBe(false);
      expect(result.rows[0].errors[0]).toContain('already exists in this GN division');
    });
  });

  describe('confirmImport', () => {
    it('commits valid rows in atomic transaction with serial allocation and updates batch status', async () => {
      prisma.importStaging.findMany.mockResolvedValue([
        {
          id: 'stage-1',
          batchId: 'batch-uuid-1',
          rowNo: 2,
          errors: [],
          data: {
            houseNo: '102/B',
            houseNoNorm: '102/B',
            headName: 'Sunil Perera',
            isEpf: true,
            isEtf: true,
            isAswesuma: false,
            isSamurdhi: false,
            hasSpecialNeeds: false,
            targetFemale: 2,
            targetMale: 1,
            langSinhala: true,
          },
        },
      ]);

      const confirmResult = await service.confirmImport(mockCdcCaller as any, 'batch-uuid-1');

      expect(confirmResult.status).toBe('committed');
      expect(confirmResult.committedCount).toBe(1);
      expect(prisma.household.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            houseNo: '102/B',
            houseNoNorm: '102/B',
            houseLeaderName: 'Sunil Perera',
            serialNo: 10,
            isEpf: true,
            isEtf: true,
            importBatchId: 'batch-uuid-1',
          }),
        ],
      });
      expect(prisma.gnDivision.update).toHaveBeenCalledWith({
        where: { id: 'gn-uuid-1' },
        data: { nextSerial: 11 },
      });
      expect(prisma.importBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch-uuid-1' },
        data: expect.objectContaining({ status: 'committed', rowsOk: 1 }),
      });
    });

    it('rejects confirmation if batch has already been committed', async () => {
      prisma.importBatch.findUnique.mockResolvedValue({
        id: 'batch-uuid-1',
        gnId: 'gn-uuid-1',
        status: 'committed',
        importedAt: new Date(),
      });

      await expect(service.confirmImport(mockCdcCaller as any, 'batch-uuid-1')).rejects.toThrow(
        'already been confirmed',
      );
    });

    it('rejects double-confirmation inside transaction when batch row status is committed', async () => {
      prisma.importStaging.findMany.mockResolvedValue([
        {
          id: 'stage-1',
          batchId: 'batch-uuid-1',
          rowNo: 2,
          errors: [],
          data: { houseNo: '102/B', houseNoNorm: '102/B', headName: 'Sunil Perera' },
        },
      ]);

      // Initial check passes (previewed), but under row lock in tx status is committed by concurrent transaction
      prisma.importBatch.findUnique.mockResolvedValue({
        id: 'batch-uuid-1',
        gnId: 'gn-uuid-1',
        status: 'previewed',
        importedAt: new Date(),
      });

      prisma.$queryRawUnsafe.mockImplementation((query: string) => {
        if (typeof query === 'string' && query.includes('import_batches')) {
          return Promise.resolve([
            {
              id: 'batch-uuid-1',
              gn_id: 'gn-uuid-1',
              status: 'committed', // Committed while waiting for lock!
              imported_at: new Date(),
              rows_total: 3,
            },
          ]);
        }
        return Promise.resolve([{ next_serial: 10 }]);
      });

      await expect(
        service.confirmImport(mockCdcCaller as any, 'batch-uuid-1'),
      ).rejects.toThrow('already been confirmed');
    });

    it('enforces expiry on previewed batches older than 24 hours', async () => {
      const expiredDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      prisma.importBatch.findUnique.mockResolvedValue({
        id: 'batch-uuid-1',
        gnId: 'gn-uuid-1',
        status: 'previewed',
        importedAt: expiredDate,
      });

      await expect(
        service.confirmImport(mockCdcCaller as any, 'batch-uuid-1'),
      ).rejects.toThrow('expired');

      expect(prisma.importBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch-uuid-1' },
        data: { status: 'expired' },
      });
    });

    it('correctly parses Sinhala UTF-8 CSV saved without a BOM', async () => {
      // Create raw UTF-8 CSV string without Byte Order Mark (BOM)
      const sinhalaCsv = 'house_no,house_leader_name,lang_sinhala\n1,සුනිල් පෙරේරා,ඔව්\n2,කමල් ප්‍රනාන්දු,නැත';
      const buf = Buffer.from(sinhalaCsv, 'utf8');

      const file = {
        originalname: 'sinhala_no_bom.csv',
        buffer: buf,
        size: buf.length,
        mimetype: 'text/csv',
      };

      const result = await service.previewImport(mockAdminCaller as any, 'gn-uuid-1', file);
      expect(result.rowsTotal).toBe(2);
      expect(result.rowsOk).toBe(2);
      expect(result.rows[0].data.headName).toBe('සුනිල් පෙරේරා');
      expect(result.rows[0].data.langSinhala).toBe(true);
      expect(result.rows[1].data.headName).toBe('කමල් ප්‍රනාන්දු');
      expect(result.rows[1].data.langSinhala).toBe(false);
    });

    it('getErrorReportCsv sanitizes =, +, -, @, tab, and carriage return per Plan Invariant 9', async () => {
      prisma.importBatch.findUnique.mockResolvedValue({
        id: 'batch-uuid-1',
        gnId: 'gn-uuid-1',
        status: 'previewed',
        stagingRows: [
          {
            rowNo: 2,
            errors: ['Validation failed'],
            data: {
              houseNo: '\t=calc',
              headName: '\r+cmd',
              address: '@SUM(A1)',
            },
          },
        ],
      });

      const csv = await service.getErrorReportCsv(mockCdcCaller as any, 'batch-uuid-1');
      expect(csv).toContain('"\'\t=calc"');
      expect(csv).toContain('"\'\r+cmd"');
      expect(csv).toContain('"\'@SUM(A1)"');
    });

    it('rejects file exceeding MAX_IMPORT_ROWS (10,000 rows) with ROW_LIMIT_EXCEEDED', async () => {
      const rows = ['house_no,head_name'];
      for (let i = 1; i <= 10001; i++) {
        rows.push(`${i},Head ${i}`);
      }
      const csvContent = rows.join('\n');
      const file = {
        buffer: Buffer.from(csvContent, 'utf-8'),
        size: csvContent.length,
        mimetype: 'text/csv',
      };

      await expect(
        service.previewImport(mockAdminCaller as any, 'gn-uuid-1', file),
      ).rejects.toMatchObject({
        response: {
          code: 'ROW_LIMIT_EXCEEDED',
        },
      });
    });

    it('rejects zip bomb / excessive uncompressed size with UNZIP_SIZE_EXCEEDED', async () => {
      // Craft a mock zip buffer with a local file header indicating > 50 MB uncompressed size
      const zipBuf = Buffer.alloc(100);
      zipBuf.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
      zipBuf.writeUInt32LE(100, 18); // compressedSize
      zipBuf.writeUInt32LE(60 * 1024 * 1024, 22); // uncompressedSize: 60 MB
      zipBuf.writeUInt16LE(4, 26); // fileNameLen
      zipBuf.writeUInt16LE(0, 28); // extraFieldLen
      zipBuf.write('test', 30);

      const file = {
        buffer: zipBuf,
        size: zipBuf.length,
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };

      await expect(
        service.previewImport(mockAdminCaller as any, 'gn-uuid-1', file),
      ).rejects.toMatchObject({
        response: {
          code: 'UNZIP_SIZE_EXCEEDED',
        },
      });
    });
  });
});

