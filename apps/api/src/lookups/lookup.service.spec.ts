import { Test, TestingModule } from '@nestjs/testing';
import { LookupService } from './lookup.service';
import { PrismaService } from '../prisma/prisma.service';
import { CANONICAL_LOOKUPS } from './lookup.data';

describe('LookupService (M1.6)', () => {
  let service: LookupService;

  const mockPrisma = {
    lookupValue: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LookupService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<LookupService>(LookupService);
    await service.onModuleInit();
  });

  it('contains all 6 required categories', async () => {
    const result = await service.getCategorizedLookups();
    const categories = Object.keys(result.categories);

    expect(categories).toContain('education');
    expect(categories).toContain('vocational_qualification');
    expect(categories).toContain('vocational_stream');
    expect(categories).toContain('job');
    expect(categories).toContain('future_hope');
    expect(categories).toContain('info_provided_by');
  });

  it('Done when criterion: Every lookup code has all three labels (En, Si, Ta)', () => {
    expect(CANONICAL_LOOKUPS.length).toBeGreaterThanOrEqual(50);

    for (const lookup of CANONICAL_LOOKUPS) {
      expect(lookup.code).toBeDefined();
      expect(lookup.code.trim().length).toBeGreaterThan(0);

      expect(lookup.labelEn).toBeDefined();
      expect(lookup.labelEn.trim().length).toBeGreaterThan(0);

      expect(lookup.labelSi).toBeDefined();
      expect(lookup.labelSi.trim().length).toBeGreaterThan(0);

      expect(lookup.labelTa).toBeDefined();
      expect(lookup.labelTa.trim().length).toBeGreaterThan(0);

      expect(lookup.sort).toBeGreaterThanOrEqual(10);
    }
  });

  it('guarantees unique lookup codes across the entire catalog', () => {
    const codes = CANONICAL_LOOKUPS.map((l) => l.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('Done when criterion: Version endpoint returns deterministic version and count', async () => {
    const versionRes = await service.getVersion();

    expect(versionRes.version).toBeDefined();
    expect(versionRes.version).toHaveLength(16);
    const activeCount = CANONICAL_LOOKUPS.filter(
      (l) => l.isActive ?? true,
    ).length;
    expect(versionRes.count).toBe(activeCount);

    // Assert same dataset gives same version
    const secondCall = await service.getVersion();
    expect(secondCall.version).toBe(versionRes.version);
  });

  it('excludes inactive placeholder lookups from categorized lookups', async () => {
    const result = await service.getCategorizedLookups();
    const allCodes = Object.values(result.categories)
      .flat()
      .map((i) => i.code);

    expect(allCodes).not.toContain('TODO_OWNER_VOC_1');
    expect(allCodes).not.toContain('TODO_OWNER_STREAM_1');
    expect(allCodes).not.toContain('TODO_OWNER_JOB_1');
  });

  it('filters by category when query parameter is provided', async () => {
    const eduResult = await service.getCategorizedLookups('education');
    const categories = Object.keys(eduResult.categories);

    expect(categories).toHaveLength(1);
    expect(categories[0]).toBe('education');
    expect(eduResult.categories['education']).toHaveLength(9);
  });

  it('seeds canonical lookups via upsert', async () => {
    const count = await service.seed();
    expect(count).toBe(CANONICAL_LOOKUPS.length);
    expect(mockPrisma.lookupValue.upsert).toHaveBeenCalledTimes(
      CANONICAL_LOOKUPS.length,
    );
  });
});
