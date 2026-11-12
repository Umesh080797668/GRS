import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JobStatus } from '@prisma/client';
import * as crypto from 'crypto';
import * as ExcelJS from 'exceljs';
import { ScopeContext, UserRole } from '../common/scope/scope.types';
import { LookupService } from '../lookups/lookup.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ExportJobService } from './export-job.service';
import { ExportStorageService } from './export-storage.service';

jest.setTimeout(60000);

describe('ExportJobService Real-DB & Private Storage Integration (M7.1)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let storage: ExportStorageService;
  let service: ExportJobService;

  const tag = `m7_real_${Date.now()}`;
  const districtId = crypto.randomUUID();
  const dsId = crypto.randomUUID();
  const gnId = crypto.randomUUID();
  const teamId = crypto.randomUUID();
  const requesterId = crypto.randomUUID();
  const householdId = crypto.randomUUID();
  const clientAId = crypto.randomUUID();
  const clientBId = crypto.randomUUID();
  const dupId = crypto.randomUUID();

  const createdJobIds: string[] = [];
  const uploadedPaths: string[] = [];

  const l4Caller: ScopeContext = {
    userId: requesterId,
    role: UserRole.cdc_secretary,
    gnId,
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
      providers: [LookupService, ExportStorageService, ExportJobService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    storage = moduleRef.get(ExportStorageService);
    service = new ExportJobService(
      prisma,
      storage,
      moduleRef.get(LookupService),
    );

    await prisma.district.create({
      data: {
        id: districtId,
        nameEn: `Test District ${tag}`,
        nameSi: 'කොළඹ පරීක්ෂණ',
        nameTa: 'கொழும்பு சோதனை',
      },
    });

    await prisma.divisionalSecretariat.create({
      data: {
        id: dsId,
        districtId,
        nameEn: `Test DS ${tag}`,
        nameSi: 'ප්‍රාදේශීය ලේකම්',
        nameTa: 'பிரதேச செயலகம்',
        sdoName: 'SDO Test',
      },
    });

    await prisma.gnDivision.create({
      data: {
        id: gnId,
        dsId,
        gnNumber: `999-${tag.slice(-4)}`,
        gnName: `Test GN ${tag}`,
        secretaryName: 'Secretary Test',
        secretaryContact: '0771234567',
      },
    });

    await prisma.team.create({
      data: {
        id: teamId,
        gnId,
        teamNo: 1,
      },
    });

    await prisma.profile.create({
      data: {
        id: requesterId,
        userCode: `GRS${String(Date.now()).slice(-10)}`,
        passwordHash: 'm7-test-not-for-login',
        role: UserRole.cdc_secretary,
        fullName: 'Test CDC Secretary',
        preferredLanguage: 'en',
        gnId,
        dsId,
        districtId,
      },
    });

    await prisma.household.create({
      data: {
        id: householdId,
        gnId,
        teamId,
        districtId,
        dsId,
        serialNo: 1,
        houseNo: '100/A',
        houseNoNorm: '100/a',
        houseLeaderName: '=CMD|calc',
        address: '100 Temple Road',
        villageName: 'ශ්‍රී ලංකා ගම',
        isEpf: true,
        targetFemale: 1,
        targetMale: 1,
        langSinhala: true,
        langTamil: true,
        createdBy: requesterId,
      },
    });

    await prisma.client.createMany({
      data: [
        {
          id: clientAId,
          householdId,
          districtId,
          dsId,
          gnId,
          teamId,
          name: 'සඳුනි தமிழ் ஸ்ரீ',
          nameNorm: 'saduni',
          age: 24,
          gender: 'F',
          address: '@SUM(1+1)',
          phoneRaw: '0771234567',
          phoneE164: '+94771234567',
          highestEducation: 'al',
          highestVocational: 'nvq_3',
          interestedVocationalStream: 'ict',
          interestedJob: 'software_dev',
          isEpf: true,
          futureHopes: ['vocational_training', 'employment_local'],
          infoProvidedBy: 'self',
          consentGiven: true,
          collectedBy: requesterId,
          collectedAt: new Date(),
          clientUpdatedAt: new Date(),
          contentHash: crypto.randomBytes(16).toString('hex'),
          createdBy: requesterId,
        },
        {
          id: clientBId,
          householdId,
          districtId,
          dsId,
          gnId,
          teamId,
          name: 'කමල් கமல்',
          nameNorm: 'kamal',
          age: 26,
          gender: 'M',
          phoneRaw: '0777654321',
          phoneE164: '+94777654321',
          highestEducation: 'ol',
          interestedVocationalStream: 'ict',
          futureHopes: ['vocational_training'],
          infoProvidedBy: 'self',
          consentGiven: true,
          collectedBy: requesterId,
          collectedAt: new Date(),
          clientUpdatedAt: new Date(),
          contentHash: crypto.randomBytes(16).toString('hex'),
          createdBy: requesterId,
        },
      ],
    });

    await prisma.duplicateCandidate.create({
      data: {
        id: dupId,
        clientA: clientAId,
        clientB: clientBId,
        score: 85,
        reasons: { factors: [{ key: 'same_household', score: 20 }] },
        status: 'open',
      },
    });

    await prisma.teamStat.create({
      data: {
        teamId,
        gnId,
        dsId,
        districtId,
        housesAssigned: 10,
        housesStarted: 5,
        housesDone: 3,
        clientsCount: 2,
        epfCount: 1,
        etfCount: 0,
        aswesumaCount: 0,
        samurdhiCount: 0,
        specialNeedsCount: 0,
      },
    });

    await prisma.areaStat.create({
      data: {
        areaType: 'gn',
        areaId: gnId,
        housesAssigned: 10,
        housesStarted: 5,
        housesDone: 3,
        clientsCount: 2,
        epfCount: 1,
        etfCount: 0,
        aswesumaCount: 0,
        samurdhiCount: 0,
        specialNeedsCount: 0,
      },
    });
  });

  afterAll(async () => {
    if (!prisma) {
      await moduleRef?.close().catch(() => undefined);
      return;
    }
    for (const p of uploadedPaths) {
      await storage.deleteObject(p).catch(() => undefined);
    }
    if (createdJobIds.length > 0) {
      await prisma.exportJob
        .deleteMany({ where: { id: { in: createdJobIds } } })
        .catch(() => undefined);
    }
    await prisma.areaStat
      .deleteMany({ where: { areaType: 'gn', areaId: gnId } })
      .catch(() => undefined);
    await prisma.teamStat
      .deleteMany({ where: { teamId } })
      .catch(() => undefined);
    await prisma.duplicateCandidate
      .deleteMany({ where: { id: dupId } })
      .catch(() => undefined);
    await prisma.client
      .deleteMany({ where: { id: { in: [clientAId, clientBId] } } })
      .catch(() => undefined);
    await prisma.household
      .deleteMany({ where: { id: householdId } })
      .catch(() => undefined);
    await prisma.team.deleteMany({ where: { id: teamId } }).catch(() => undefined);
    await prisma.profile
      .deleteMany({ where: { id: requesterId } })
      .catch(() => undefined);
    await prisma.gnDivision
      .deleteMany({ where: { id: gnId } })
      .catch(() => undefined);
    await prisma.divisionalSecretariat
      .deleteMany({ where: { id: dsId } })
      .catch(() => undefined);
    await prisma.district
      .deleteMany({ where: { id: districtId } })
      .catch(() => undefined);
    await moduleRef.close();
  });

  it('creates real R2 XLSX in private Supabase Storage, rejects unsigned public fetch, and downloads cleanly via 24h signed URL', async () => {
    const res = await service.createExportForCaller(l4Caller, {
      kind: 'clients',
      format: 'xlsx',
      lang: 'si',
    });

    createdJobIds.push(res.id);
    if (res.filePath) uploadedPaths.push(res.filePath);

    expect(res.status).toBe(JobStatus.done);
    expect(res.rowCount).toBe(2);
    expect(res.signedUrl).toBeTruthy();

    // Verify private bucket enforcement: unauthenticated/unsigned fetch must fail
    const supabaseUrl = process.env.SUPABASE_URL!.replace(/\/+$/, '');
    const publicAttempt = await fetch(
      `${supabaseUrl}/storage/v1/object/${storage.getBucketName()}/${res.filePath}`,
    );
    expect(publicAttempt.ok).toBe(false);

    // Verify signed URL download succeeds and parses valid XLSX with NFC Sinhala/Tamil + formula escaping
    const dlRes = await fetch(res.signedUrl!);
    expect(dlRes.ok).toBe(true);
    const arrayBuf = await dlRes.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(arrayBuf) as any);
    const sheet = wb.worksheets[0];
    expect(sheet.columnCount).toBe(47);
    expect(sheet.rowCount).toBe(3); // 1 header + 2 clients
    expect(sheet.getRow(2).getCell(11).value).toBe("'=CMD|calc");
    expect(sheet.getRow(2).getCell(27).value).toBe(
      'සඳුනි தமிழ் ஸ்ரீ'.normalize('NFC'),
    );
  });

  it('runs R1, R3, R4 (with real UNNEST), R5, and worker-claimed async queue against real Postgres', async () => {
    const r4 = await service.createExportForCaller(l4Caller, {
      kind: 'interests',
      lang: 'ta',
    });
    createdJobIds.push(r4.id);
    if (r4.filePath) uploadedPaths.push(r4.filePath);
    expect(r4.status).toBe(JobStatus.done);
    expect(r4.rowCount).toBeGreaterThanOrEqual(4);

    const r1 = await service.createExportForCaller(l4Caller, {
      kind: 'progress',
      lang: 'en',
    });
    createdJobIds.push(r1.id);
    if (r1.filePath) uploadedPaths.push(r1.filePath);
    expect(r1.status).toBe(JobStatus.done);

    const r3 = await service.createExportForCaller(l4Caller, {
      kind: 'beneficiaries',
      lang: 'en',
    });
    createdJobIds.push(r3.id);
    if (r3.filePath) uploadedPaths.push(r3.filePath);
    expect(r3.status).toBe(JobStatus.done);

    const queuedDup = await service.createExportForCaller(l4Caller, {
      kind: 'duplicates',
      lang: 'en',
      async: true,
    });
    createdJobIds.push(queuedDup.id);
    expect(queuedDup.status).toBe(JobStatus.queued);
    expect(queuedDup.runner).toBe('worker');

    const claimed = await service.claimAndProcessNextJob(queuedDup.id);
    expect(claimed).toBe(true);
    const completed = await service.getExportJobForCaller(l4Caller, queuedDup.id);
    if (completed.filePath) uploadedPaths.push(completed.filePath);
    expect(completed.status).toBe(JobStatus.done);
    expect(completed.signedUrl).toBeTruthy();
  });
});
