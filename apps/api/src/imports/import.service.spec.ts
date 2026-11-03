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
      },
      importBatch: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'batch-uuid-1', ...data, importedAt: new Date() }),
        ),
        findUnique: jest.fn().mockResolvedValue({
          id: 'batch-uuid-1',
          gnId: 'gn-uuid-1',
          status: 'previewed',
          rowsTotal: 3,
          fileName: 'test.xlsx',
        }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'batch-uuid-1', ...data })),
      },
      importStaging: {
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ next_serial: 10 }]),
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
      expect(prisma.household.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            houseNo: '102/B',
            houseNoNorm: '102/B',
            houseLeaderName: 'Sunil Perera',
            serialNo: 10,
            isEpf: true,
            isEtf: true,
            importBatchId: 'batch-uuid-1',
          }),
        }),
      );
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
      });

      await expect(service.confirmImport(mockCdcCaller as any, 'batch-uuid-1')).rejects.toThrow(
        'already been confirmed',
      );
    });
  });
});

