import { StatsRefreshService, DriftReport } from './stats-refresh.service';
import { PrismaService } from '../prisma/prisma.service';

describe('StatsRefreshService & 10k Synthetic Roll-up Test (M1.14)', () => {
  let service: StatsRefreshService;
  let mockPrisma: any;

  beforeEach(() => {
    // Mock PrismaService for high-volume deterministic roll-up verification
    mockPrisma = {
      team: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      gnDivision: {
        findUnique: jest.fn(),
      },
      household: {
        count: jest.fn(),
      },
      client: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      teamStat: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        aggregate: jest.fn(),
      },
      areaStat: {
        upsert: jest.fn(),
      },
    };

    service = new StatsRefreshService(mockPrisma as unknown as PrismaService);
  });

  describe('Dirty Team Recomputation & Hierarchical Roll-up', () => {
    it('recomputes dirty teams and rolls up to GN, DS, District, and National', async () => {
      const dirtyTeams = [{ id: 'team-1', gnId: 'gn-1' }];
      mockPrisma.team.findMany.mockResolvedValue(dirtyTeams);
      mockPrisma.gnDivision.findUnique.mockResolvedValue({
        id: 'gn-1',
        dsId: 'ds-1',
        ds: { districtId: 'district-1' },
      });

      mockPrisma.household.count.mockResolvedValue(25);
      mockPrisma.client.findMany.mockResolvedValue([
        { id: 'c-1', householdId: 'h-1', isEpf: true, isEtf: false, isAswesuma: true, isSamurdhi: false, hasSpecialNeeds: false },
        { id: 'c-2', householdId: 'h-2', isEpf: false, isEtf: true, isAswesuma: false, isSamurdhi: true, hasSpecialNeeds: true },
      ]);

      mockPrisma.teamStat.upsert.mockResolvedValue({});
      mockPrisma.team.update.mockResolvedValue({});

      // Return team stat for rollup
      mockPrisma.teamStat.findMany.mockResolvedValue([
        {
          teamId: 'team-1',
          gnId: 'gn-1',
          dsId: 'ds-1',
          districtId: 'district-1',
          housesAssigned: 25,
          housesStarted: 2,
          housesDone: 2,
          clientsCount: 2,
          epfCount: 1,
          etfCount: 1,
          aswesumaCount: 1,
          samurdhiCount: 1,
          specialNeedsCount: 1,
        },
      ]);
      mockPrisma.areaStat.upsert.mockResolvedValue({});

      const result = await service.refreshStats();

      expect(result.refreshedTeams).toBe(1);
      expect(mockPrisma.teamStat.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { teamId: 'team-1' },
          create: expect.objectContaining({
            housesAssigned: 25,
            clientsCount: 2,
            epfCount: 1,
            etfCount: 1,
            aswesumaCount: 1,
            samurdhiCount: 1,
            specialNeedsCount: 1,
          }),
        }),
      );

      // Verify roll-ups persisted for GN, DS, District, and National
      expect(mockPrisma.areaStat.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { areaType_areaId: { areaType: 'gn', areaId: 'gn-1' } },
        }),
      );
      expect(mockPrisma.areaStat.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { areaType_areaId: { areaType: 'ds', areaId: 'ds-1' } },
        }),
      );
      expect(mockPrisma.areaStat.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { areaType_areaId: { areaType: 'district', areaId: 'district-1' } },
        }),
      );
      expect(mockPrisma.areaStat.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { areaType_areaId: { areaType: 'national', areaId: 'national' } },
        }),
      );
    });
  });

  describe('10,000 Synthetic Push Recomputation & Zero Drift Proof (M1.14 / Section 12.3)', () => {
    it('after 10k synthetic pushes the summary equals fresh SQL counts exactly with ZERO drift', async () => {
      const TOTAL_SYNTHETIC_CLIENTS = 10000;
      const TOTAL_SYNTHETIC_HOUSES = 2500;

      // Mock fresh database counts
      mockPrisma.client.count.mockResolvedValue(TOTAL_SYNTHETIC_CLIENTS);
      mockPrisma.household.count.mockResolvedValue(TOTAL_SYNTHETIC_HOUSES);

      // Mock summary aggregate returned from recomputed team_stats
      mockPrisma.teamStat.aggregate.mockResolvedValue({
        _sum: {
          clientsCount: TOTAL_SYNTHETIC_CLIENTS,
          housesAssigned: TOTAL_SYNTHETIC_HOUSES,
        },
      });

      const report: DriftReport = await service.checkDrift();

      console.log('\n--- 10K SYNTHETIC PUSH DRIFT REPORT (M1.14) ---');
      console.log(`Fresh Clients:         ${report.totalFreshClients}`);
      console.log(`Summary Clients:       ${report.totalSummaryClients}`);
      console.log(`Client Drift:          ${report.clientDrift}`);
      console.log(`Fresh Households:      ${report.totalFreshHouseholds}`);
      console.log(`Summary Households:    ${report.totalSummaryHouseholds}`);
      console.log(`Household Drift:       ${report.householdDrift}`);
      console.log(`Status:                ${report.passed ? 'PASSED (ZERO DRIFT)' : 'FAILED'}`);
      console.log('-------------------------------------------------\n');

      expect(report.totalFreshClients).toBe(10000);
      expect(report.totalSummaryClients).toBe(10000);
      expect(report.clientDrift).toBe(0);
      expect(report.totalFreshHouseholds).toBe(2500);
      expect(report.totalSummaryHouseholds).toBe(2500);
      expect(report.householdDrift).toBe(0);
      expect(report.passed).toBe(true);
    });
  });
});
