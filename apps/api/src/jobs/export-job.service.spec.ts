import { Test, TestingModule } from '@nestjs/testing';
import { ExportJobService } from './export-job.service';
import { PrismaService } from '../prisma/prisma.service';
import { JobStatus } from '@prisma/client';

describe('ExportJobService (Spike S7 & Task M0.9 / M1.14)', () => {
  let service: ExportJobService;

  let inMemoryJobs: any[] = [];

  const mockPrisma = {
    exportJob: {
      create: jest.fn().mockImplementation(({ data }) => {
        const item = {
          id: `job-${Date.now()}-${Math.random()}`,
          ...data,
          createdAt: new Date(),
        };
        inMemoryJobs.push(item);
        return Promise.resolve(item);
      }),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(inMemoryJobs.find((j) => j.id === where.id) || null);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const idx = inMemoryJobs.findIndex((j) => j.id === where.id);
        if (idx !== -1) {
          inMemoryJobs[idx] = { ...inMemoryJobs[idx], ...data };
          return Promise.resolve(inMemoryJobs[idx]);
        }
        return Promise.resolve(null);
      }),
    },
  };

  beforeEach(async () => {
    inMemoryJobs = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportJobService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ExportJobService>(ExportJobService);
  });

  it('queues an export job with 7-day retention', async () => {
    const job = await service.queueExport({
      requestedBy: 'user-1',
      kind: 'clients',
      filters: { districtId: 'colombo-1' },
    });

    expect(job.status).toBe(JobStatus.queued);
    expect(job.kind).toBe('clients');
    expect(job.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
    expect(inMemoryJobs).toHaveLength(1);
  });

  it('processes export job end-to-end, writing XLSX and marking ready (Spike S7)', async () => {
    const job = await service.queueExport({
      requestedBy: 'user-1',
      kind: 'clients',
    });

    const result = await service.processExport(job.id);

    expect(result.status).toBe(JobStatus.done);
    expect(result.rowCount).toBe(50);

    const completed = inMemoryJobs.find((j) => j.id === job.id);
    expect(completed.status).toBe(JobStatus.done);
    expect(completed.filePath).toContain('.clients.xlsx');
  });

  it('simulates pg_cron scheduled stats refresh job every 5 minutes (M0.9 Done when)', async () => {
    const refresh = await service.refreshDirtySummaries();
    expect(refresh.refreshedAt).toBeDefined();
    expect(refresh.teamsCount).toBeGreaterThanOrEqual(1);
  });
});
