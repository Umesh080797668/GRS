import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JobStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import { ScopeContext, UserRole } from '../common/scope/scope.types';
import { CANONICAL_LOOKUPS } from '../lookups/lookup.data';
import { LookupService } from '../lookups/lookup.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  formatCsvRow,
  R2_CLIENT_COLUMN_KEYS,
  sanitizeSpreadsheetCell,
} from './export-formatters';
import { ExportJobService } from './export-job.service';
import { ExportStorageService } from './export-storage.service';

describe('ExportJobService (M7.1 & Spike S7)', () => {
  let service: ExportJobService;
  let prismaMock: any;
  let storageMock: {
    isConfigured: jest.Mock;
    uploadFromFile: jest.Mock;
    createSignedUrl: jest.Mock;
    deleteObject: jest.Mock;
    uploadedBuffers: Map<string, Buffer>;
  };
  let inMemoryJobs: any[];

  const sampleDistrict = {
    id: '00000000-0000-4000-8000-0000000000d1',
    nameEn: 'Colombo',
    nameSi: 'කොළඹ',
    nameTa: 'கொழும்பு',
  };
  const sampleDs = {
    id: '00000000-0000-4000-8000-000000000ds1',
    districtId: sampleDistrict.id,
    nameEn: 'Thimbirigasyaya',
    nameSi: 'තිඹිරිගස්යාය',
    nameTa: 'திம்பிரிகஸ்யாய',
    sdoName: 'K. Perera',
  };
  const sampleGn = {
    id: '00000000-0000-4000-8000-000000000gn1',
    dsId: sampleDs.id,
    gnNumber: '551A',
    gnName: 'Narahenpita',
    secretaryName: 'Nimali Silva',
    secretaryContact: '0771112222',
    secretaryEmail: 'sec@example.lk',
  };
  const sampleTeam = {
    id: '00000000-0000-4000-8000-000000000tm1',
    gnId: sampleGn.id,
    teamNo: 3,
    statsDirtyAt: null,
    gn: {
      dsId: sampleDs.id,
      ds: { districtId: sampleDistrict.id },
    },
  };
  const sampleHousehold = {
    id: '00000000-0000-4000-8000-000000000hh1',
    gnId: sampleGn.id,
    teamId: sampleTeam.id,
    districtId: sampleDistrict.id,
    dsId: sampleDs.id,
    serialNo: 12,
    houseNo: '14/2',
    houseLeaderName: '=CMD|"/C calc"!A0',
    address: 'No 14/2, Hospital Rd',
    villageName: 'ශ්‍රී ලංකා ගම',
    isEpf: true,
    isEtf: false,
    isAswesuma: true,
    isSamurdhi: false,
    hasSpecialNeeds: false,
    targetFemale: 1,
    targetMale: 1,
    ageGroupMin: 18,
    ageGroupMax: 35,
    langSinhala: true,
    langTamil: true,
    langEnglish: false,
  };
  const sampleClient = {
    id: '00000000-0000-4000-8000-000000000cl1',
    householdId: sampleHousehold.id,
    districtId: sampleDistrict.id,
    dsId: sampleDs.id,
    gnId: sampleGn.id,
    teamId: sampleTeam.id,
    name: 'සඳුනි தமிழ் ஸ்ரீ ක්‍ෂ',
    age: 24,
    gender: 'F',
    address: '@SUM(1+1)',
    phoneRaw: '0771234567',
    phoneE164: '+94771234567',
    whatsappRaw: '\t0771234567',
    whatsappE164: '+94771234567',
    highestEducation: 'al',
    highestVocational: 'nvq_3',
    interestedVocationalStream: 'ict',
    interestedJob: 'software_dev',
    isEpf: true,
    isEtf: false,
    isAswesuma: false,
    isSamurdhi: true,
    hasSpecialNeeds: false,
    futureHopes: ['vocational_training', 'employment_local'],
    infoProvidedBy: 'self',
    infoProvidedByOther: null,
    consentGiven: true,
    createdAt: new Date('2026-10-01T10:00:00Z'),
  };

  const l4Caller: ScopeContext = {
    userId: '00000000-0000-4000-8000-000000000u04',
    role: UserRole.cdc_secretary,
    gnId: sampleGn.id,
  };
  const l3Caller: ScopeContext = {
    userId: '00000000-0000-4000-8000-000000000u03',
    role: UserRole.sda,
    dsId: sampleDs.id,
  };
  const l2Caller: ScopeContext = {
    userId: '00000000-0000-4000-8000-000000000u02',
    role: UserRole.dc,
    districtId: sampleDistrict.id,
  };
  const l5Caller: ScopeContext = {
    userId: '00000000-0000-4000-8000-000000000u05',
    role: UserRole.team_member,
    teamId: sampleTeam.id,
  };
  const superAdminCaller: ScopeContext = {
    userId: '00000000-0000-4000-8000-000000000u00',
    role: UserRole.super_admin,
  };

  beforeEach(async () => {
    delete process.env.EXPORT_INLINE_ROW_CAP;
    inMemoryJobs = [];
    const uploadedBuffers = new Map<string, Buffer>();

    storageMock = {
      uploadedBuffers,
      isConfigured: jest.fn(() => true),
      uploadFromFile: jest.fn(async (objectPath: string, filePath: string) => {
        const buf = await fs.promises.readFile(filePath);
        uploadedBuffers.set(objectPath, buf);
        return { path: objectPath, byteLength: buf.byteLength };
      }),
      createSignedUrl: jest.fn(async (objectPath: string, expiresIn = 86400) => ({
        signedUrl: `https://storage.local/sign/grs-exports/${objectPath}?expiresIn=${expiresIn}`,
        expiresInSeconds: expiresIn,
      })),
      deleteObject: jest.fn(async () => undefined),
    };

    prismaMock = {
      profile: {
        findUnique: jest.fn(async () => ({ preferredLanguage: 'en' })),
      },
      district: {
        findMany: jest.fn(async () => [sampleDistrict]),
        findUnique: jest.fn(async ({ where }: any) =>
          where.id === sampleDistrict.id ? sampleDistrict : null,
        ),
      },
      divisionalSecretariat: {
        findMany: jest.fn(async () => [sampleDs]),
        findUnique: jest.fn(async ({ where }: any) =>
          where.id === sampleDs.id ? sampleDs : null,
        ),
      },
      gnDivision: {
        findMany: jest.fn(async () => [sampleGn]),
        findUnique: jest.fn(async ({ where }: any) =>
          where.id === sampleGn.id ? { ...sampleGn, ds: { districtId: sampleDistrict.id } } : null,
        ),
      },
      team: {
        findMany: jest.fn(async () => [sampleTeam]),
        findUnique: jest.fn(async ({ where }: any) =>
          where.id === sampleTeam.id ? sampleTeam : null,
        ),
      },
      household: {
        findMany: jest.fn(async () => [sampleHousehold]),
      },
      client: {
        findMany: jest.fn(async () => [sampleClient]),
        groupBy: jest.fn(async ({ by }: any) => {
          const field = by[0];
          if (field === 'interestedVocationalStream') {
            return [{ interestedVocationalStream: 'ict', _count: { _all: 5 } }];
          }
          if (field === 'interestedJob') {
            return [{ interestedJob: 'software_dev', _count: { _all: 3 } }];
          }
          if (field === 'highestEducation') {
            return [{ highestEducation: 'al', _count: { _all: 4 } }];
          }
          if (field === 'highestVocational') {
            return [{ highestVocational: 'nvq_3', _count: { _all: 2 } }];
          }
          return [];
        }),
      },
      duplicateCandidate: {
        findMany: jest.fn(async () => [
          {
            id: '00000000-0000-4000-8000-000000000dup1',
            clientA: sampleClient.id,
            clientB: '00000000-0000-4000-8000-000000000cl2',
            score: 96,
            status: 'open',
            reasons: { factors: [{ key: 'exact_phone', score: 50 }] },
            reviewedAt: null,
            createdAt: new Date('2026-10-02T08:00:00Z'),
            clientARecord: {
              ...sampleClient,
              household: { houseNo: '14/2', gn: sampleGn },
            },
            clientBRecord: {
              id: '00000000-0000-4000-8000-000000000cl2',
              name: '=HACKER',
              age: 24,
              gender: 'F',
              phoneE164: '+94771234567',
              household: { houseNo: '14/2', gn: sampleGn },
            },
            reviewer: null,
          },
        ]),
      },
      areaStat: {
        findUnique: jest.fn(async () => ({
          housesAssigned: 120,
          housesStarted: 90,
          housesDone: 60,
          clientsCount: 150,
          epfCount: 25,
          etfCount: 15,
          aswesumaCount: 18,
          samurdhiCount: 32,
          specialNeedsCount: 4,
          refreshedAt: new Date('2026-10-05T12:00:00Z'),
        })),
        findMany: jest.fn(async () => [
          {
            areaId: sampleDistrict.id,
            housesAssigned: 120,
            housesStarted: 90,
            housesDone: 60,
            clientsCount: 150,
            epfCount: 25,
            etfCount: 15,
            aswesumaCount: 18,
            samurdhiCount: 32,
            specialNeedsCount: 4,
            refreshedAt: new Date('2026-10-05T12:00:00Z'),
          },
        ]),
      },
      teamStat: {
        findUnique: jest.fn(async () => ({
          housesAssigned: 30,
          housesStarted: 20,
          housesDone: 15,
          clientsCount: 40,
          epfCount: 5,
          etfCount: 3,
          aswesumaCount: 4,
          samurdhiCount: 8,
          specialNeedsCount: 1,
          refreshedAt: new Date('2026-10-05T12:00:00Z'),
        })),
        findMany: jest.fn(async () => [
          {
            teamId: sampleTeam.id,
            housesAssigned: 30,
            housesStarted: 20,
            housesDone: 15,
            clientsCount: 40,
            epfCount: 5,
            etfCount: 3,
            aswesumaCount: 4,
            samurdhiCount: 8,
            specialNeedsCount: 1,
            refreshedAt: new Date('2026-10-05T12:00:00Z'),
          },
        ]),
      },
      $queryRaw: jest.fn(async () => [
        { code: 'vocational_training', cnt: BigInt(7) },
      ]),
      exportJob: {
        create: jest.fn(async ({ data }: any) => {
          const job = {
            id: `00000000-0000-4000-8000-${String(inMemoryJobs.length + 1).padStart(12, '0')}`,
            ...data,
            filePath: null,
            error: null,
            createdAt: new Date(),
          };
          inMemoryJobs.push(job);
          return job;
        }),
        findUnique: jest.fn(async ({ where }: any) => {
          return inMemoryJobs.find((j) => j.id === where.id) || null;
        }),
        findFirst: jest.fn(async ({ where }: any) => {
          return (
            inMemoryJobs.find((j) =>
              where?.status ? j.status === where.status : true,
            ) || null
          );
        }),
        findMany: jest.fn(async ({ where }: any) => {
          return inMemoryJobs.filter((j) =>
            where?.requestedBy ? j.requestedBy === where.requestedBy : true,
          );
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const idx = inMemoryJobs.findIndex((j) => j.id === where.id);
          if (idx !== -1) {
            inMemoryJobs[idx] = { ...inMemoryJobs[idx], ...data };
            return inMemoryJobs[idx];
          }
          return null;
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const idx = inMemoryJobs.findIndex(
            (j) => j.id === where.id && j.status === where.status,
          );
          if (idx === -1) return { count: 0 };
          inMemoryJobs[idx] = { ...inMemoryJobs[idx], ...data };
          return { count: 1 };
        }),
      },
    };

    const lookupMock = {
      getCategorizedLookups: jest.fn(async () => ({
        version: 'v1',
        count: CANONICAL_LOOKUPS.length,
        categories: CANONICAL_LOOKUPS.reduce<Record<string, any[]>>(
          (acc, item) => {
            acc[item.category] = acc[item.category] || [];
            acc[item.category].push(item);
            return acc;
          },
          {},
        ),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportJobService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ExportStorageService, useValue: storageMock },
        { provide: LookupService, useValue: lookupMock },
      ],
    }).compile();

    service = module.get<ExportJobService>(ExportJobService);
  });

  it('queues an export job with 24-hour retention (M7.1)', async () => {
    const before = Date.now();
    const job = await service.queueExport({
      requestedBy: 'user-1',
      kind: 'clients',
      filters: { district: 'Colombo' },
    });

    expect(job.status).toBe(JobStatus.queued);
    expect(job.kind).toBe('clients');
    const diffMs = job.expiresAt.getTime() - before;
    expect(diffMs).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
    expect(inMemoryJobs).toHaveLength(1);
  });

  it('processes R2 clients XLSX end-to-end with 47 columns, formula escaping, NFC Sinhala/Tamil, and uploads privately', async () => {
    const created = await service.createExportForCaller(l4Caller, {
      kind: 'clients',
      format: 'xlsx',
      lang: 'si',
    });

    expect(created.runner).toBe('inline');
    expect(created.status).toBe(JobStatus.done);
    expect(created.signedUrl).toContain('https://storage.local/sign/grs-exports/');
    expect(created.rowCount).toBe(1);
    expect(storageMock.uploadFromFile).toHaveBeenCalledTimes(1);

    const buf = storageMock.uploadedBuffers.get(created.filePath!);
    expect(buf).toBeDefined();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const sheet = wb.worksheets[0];
    expect(sheet.columnCount).toBe(R2_CLIENT_COLUMN_KEYS.length);
    expect(sheet.columnCount).toBe(47);

    const headerRow = sheet.getRow(1);
    expect(headerRow.getCell(1).value).toBe('දිස්ත්‍රික්කය');
    expect(headerRow.getCell(27).value).toBe('සාමාජිකයාගේ නම');

    const dataRow = sheet.getRow(2);
    // Formula injection checks (Invariant 9)
    expect(dataRow.getCell(11).value).toBe(`'=CMD|"/C calc"!A0`); // house_leader_name
    expect(dataRow.getCell(30).value).toBe(`'@SUM(1+1)`); // client_address
    expect(dataRow.getCell(32).value).toBe(`'+94771234567`); // phone_e164
    expect(dataRow.getCell(33).value).toBe(`'\t0771234567`); // whatsapp_raw

    // Sinhala/Tamil NFC preservation & translated labels
    expect(dataRow.getCell(1).value).toBe('කොළඹ');
    expect(dataRow.getCell(27).value).toBe('සඳුනි தமிழ் ஸ்ரீ ක්‍ෂ'.normalize('NFC'));
    expect(dataRow.getCell(29).value).toBe('ස්ත්‍රී'); // Gender in Sinhala
    expect(dataRow.getCell(47).value).toBe('ඔව්'); // consent_given in Sinhala
  });

  it('exports R2 clients CSV with UTF-8 BOM, Tamil labels, and RFC-4180 + formula escaping', async () => {
    const created = await service.createExportForCaller(superAdminCaller, {
      kind: 'clients',
      format: 'csv',
      lang: 'ta',
    });

    expect(created.status).toBe(JobStatus.done);
    const buf = storageMock.uploadedBuffers.get(created.filePath!);
    const text = buf!.toString('utf8');
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(text).toContain('மாவட்டம்');
    expect(text).toContain('கொழும்பு');
    expect(text).toContain('பெண்'); // Female in Tamil
    expect(text).toContain("'+94771234567");
    expect(text).toContain("'@SUM(1+1)");
  });

  it('generates R1 progress, R3 beneficiaries, R4 interests, and R5 duplicates reports cleanly', async () => {
    const r1 = await service.createExportForCaller(l2Caller, {
      kind: 'progress',
      lang: 'en',
    });
    expect(r1.status).toBe(JobStatus.done);
    const r1Wb = new ExcelJS.Workbook();
    await r1Wb.xlsx.load(storageMock.uploadedBuffers.get(r1.filePath!) as any);
    expect(r1Wb.worksheets[0].getRow(1).getCell(1).value).toBe('Scope Level');
    expect(r1Wb.worksheets[0].getRow(2).getCell(5).value).toBe(120);

    const r3 = await service.createExportForCaller(l3Caller, {
      kind: 'beneficiaries',
      lang: 'en',
    });
    expect(r3.status).toBe(JobStatus.done);
    const r3Wb = new ExcelJS.Workbook();
    await r3Wb.xlsx.load(storageMock.uploadedBuffers.get(r3.filePath!) as any);
    expect(r3Wb.worksheets[0].getRow(1).getCell(6).value).toBe('EPF Beneficiaries');
    expect(r3Wb.worksheets[0].getRow(2).getCell(6).value).toBe(25);

    const r4 = await service.createExportForCaller(superAdminCaller, {
      kind: 'interests',
      lang: 'en',
    });
    expect(r4.status).toBe(JobStatus.done);
    const r4Wb = new ExcelJS.Workbook();
    await r4Wb.xlsx.load(storageMock.uploadedBuffers.get(r4.filePath!) as any);
    expect(r4Wb.worksheets[0].rowCount).toBeGreaterThanOrEqual(5);

    const r5 = await service.createExportForCaller(l4Caller, {
      kind: 'duplicates',
      lang: 'en',
    });
    expect(r5.status).toBe(JobStatus.done);
    const r5Wb = new ExcelJS.Workbook();
    await r5Wb.xlsx.load(storageMock.uploadedBuffers.get(r5.filePath!) as any);
    expect(r5Wb.worksheets[0].getRow(2).getCell(14).value).toBe("'=HACKER");
  });

  it('enforces role and hierarchical scope access fail-closed', async () => {
    // L5 forbidden everywhere
    await expect(
      service.createExportForCaller(l5Caller, { kind: 'clients' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(service.listExportsForCaller(l5Caller)).rejects.toThrow(
      ForbiddenException,
    );

    // R5 duplicates restricted strictly to L4 and L00 (Plan §10)
    await expect(
      service.createExportForCaller(l3Caller, { kind: 'duplicates' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.createExportForCaller(l2Caller, { kind: 'duplicates' }),
    ).rejects.toThrow(ForbiddenException);

    // Cross-area filter rejection
    await expect(
      service.createExportForCaller(l4Caller, {
        kind: 'clients',
        filters: { gnId: '00000000-0000-4000-8000-000000009999' },
      }),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.createExportForCaller(l4Caller, {
        kind: 'clients',
        filters: { districtId: sampleDistrict.id },
      }),
    ).rejects.toThrow(ForbiddenException);

    // Horizontal job access check
    const job = await service.createExportForCaller(l4Caller, {
      kind: 'progress',
    });
    await expect(
      service.getExportJobForCaller(l3Caller, job.id),
    ).rejects.toThrow(ForbiddenException);
  });

  it('defers jobs exceeding inline row cap to queued worker runner and claims them without OFFSET', async () => {
    process.env.EXPORT_INLINE_ROW_CAP = '2';

    // Simulate > 2 clients so probe returns 3 rows on first estimate call, then 2 + 1 batch on stream
    const manyClients = [1, 2, 3].map((i) => ({
      ...sampleClient,
      id: `00000000-0000-4000-8000-000000000cl${i}`,
      createdAt: new Date(`2026-10-0${i}T10:00:00Z`),
    }));

    prismaMock.client.findMany
      .mockResolvedValueOnce(manyClients) // estimateExportRowCount probe
      .mockResolvedValueOnce(manyClients) // streamClientRows batch 1
      .mockResolvedValueOnce([]); // shouldn't even need if < 2000

    const queued = await service.createExportForCaller(superAdminCaller, {
      kind: 'clients',
      format: 'xlsx',
    });

    expect(queued.runner).toBe('worker');
    expect(queued.status).toBe(JobStatus.queued);
    expect(queued.signedUrl).toBeNull();

    // Standalone long runner claims and completes the job
    const claimed = await service.claimAndProcessNextJob(queued.id);
    expect(claimed).toBe(true);

    const fetched = await service.getExportJobForCaller(
      superAdminCaller,
      queued.id,
    );
    expect(fetched.status).toBe(JobStatus.done);
    expect(fetched.signedUrl).toContain('https://storage.local/sign/grs-exports/');

    // Ensure ZERO OFFSET (`skip`) was ever passed in any Prisma client query
    for (const call of prismaMock.client.findMany.mock.calls) {
      expect(call[0]).not.toHaveProperty('skip');
    }
  });

  it('expires stale export jobs past 24h and revokes signed URLs', async () => {
    const pastJob = await service.queueExport({
      requestedBy: l4Caller.userId,
      kind: 'progress',
    });
    inMemoryJobs[0].status = JobStatus.done;
    inMemoryJobs[0].filePath = 'exports/expired/file.xlsx';
    inMemoryJobs[0].expiresAt = new Date(Date.now() - 1000);

    const view = await service.getExportJobForCaller(l4Caller, pastJob.id);
    expect(view.status).toBe(JobStatus.expired);
    expect(view.signedUrl).toBeNull();
    expect(storageMock.deleteObject).toHaveBeenCalledWith(
      'exports/expired/file.xlsx',
    );
  });

  it('sanitizes all formula injection prefixes per Invariant 9 and reports dirty team summaries', async () => {
    expect(sanitizeSpreadsheetCell('=1+1')).toBe("'=1+1");
    expect(sanitizeSpreadsheetCell('+CMD|calc')).toBe("'+CMD|calc");
    expect(sanitizeSpreadsheetCell('-2+3')).toBe("'-2+3");
    expect(sanitizeSpreadsheetCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
    expect(sanitizeSpreadsheetCell('\t=cmd')).toBe("'\t=cmd");
    expect(sanitizeSpreadsheetCell('\r=cmd')).toBe("'\r=cmd");
    expect(sanitizeSpreadsheetCell('Normal Text ශ්‍රී தமிழ்')).toBe(
      'Normal Text ශ්‍රී தமிழ்'.normalize('NFC'),
    );

    const csvLine = formatCsvRow(['=1+1', 'Hello, "World"', '+94770001111']);
    expect(csvLine).toBe(`'=1+1,"Hello, ""World""",'+94770001111\r\n`);

    const dirtyRes = await service.refreshDirtySummaries();
    expect(dirtyRes.teamsCount).toBe(1);
    expect(dirtyRes.refreshedAt).toBeInstanceOf(Date);
  });
});
