import { Test, TestingModule } from '@nestjs/testing';
import { AreaService } from './area.service';
import { PrismaService } from '../prisma/prisma.service';
import { SRI_LANKA_25_DISTRICTS } from './districts.data';

describe('AreaService (M1.7)', () => {
  let service: AreaService;

  let inMemoryDistricts: any[] = [];
  let inMemoryDs: any[] = [];
  let inMemoryGn: any[] = [];
  let inMemoryTeams: any[] = [];

  const mockPrisma = {
    district: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          inMemoryDistricts.find(
            (d) =>
              d.nameEn.toLowerCase() ===
              (where.nameEn.equals || where.nameEn).toLowerCase(),
          ) || null,
        );
      }),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          inMemoryDistricts.find((d) => d.id === where.id) || null,
        );
      }),
      findMany: jest
        .fn()
        .mockImplementation(() => Promise.resolve(inMemoryDistricts)),
      create: jest.fn().mockImplementation(({ data }) => {
        const d = { id: `dist-${Date.now()}-${Math.random()}`, ...data };
        inMemoryDistricts.push(d);
        return Promise.resolve(d);
      }),
    },
    divisionalSecretariat: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          inMemoryDs.find(
            (ds) =>
              ds.districtId === where.districtId &&
              ds.nameEn.toLowerCase() ===
                (where.nameEn.equals || where.nameEn).toLowerCase(),
          ) || null,
        );
      }),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          inMemoryDs.find((ds) => ds.id === where.id) || null,
        );
      }),
      findMany: jest.fn().mockImplementation(() => Promise.resolve(inMemoryDs)),
      create: jest.fn().mockImplementation(({ data }) => {
        const ds = { id: `ds-${Date.now()}-${Math.random()}`, ...data };
        inMemoryDs.push(ds);
        return Promise.resolve(ds);
      }),
    },
    gnDivision: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.dsId_gnNumber) {
          return Promise.resolve(
            inMemoryGn.find(
              (gn) =>
                gn.dsId === where.dsId_gnNumber.dsId &&
                gn.gnNumber === where.dsId_gnNumber.gnNumber,
            ) || null,
          );
        }
        if (where.id) {
          return Promise.resolve(
            inMemoryGn.find((gn) => gn.id === where.id) || null,
          );
        }
        return Promise.resolve(null);
      }),
      findMany: jest.fn().mockImplementation(() => Promise.resolve(inMemoryGn)),
      create: jest.fn().mockImplementation(({ data }) => {
        const gn = { id: `gn-${Date.now()}-${Math.random()}`, ...data };
        inMemoryGn.push(gn);
        return Promise.resolve(gn);
      }),
    },
    team: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.gnId_teamNo) {
          return Promise.resolve(
            inMemoryTeams.find(
              (t) =>
                t.gnId === where.gnId_teamNo.gnId &&
                t.teamNo === where.gnId_teamNo.teamNo,
            ) || null,
          );
        }
        if (where.id) {
          return Promise.resolve(
            inMemoryTeams.find((t) => t.id === where.id) || null,
          );
        }
        return Promise.resolve(null);
      }),
      findMany: jest
        .fn()
        .mockImplementation(() => Promise.resolve(inMemoryTeams)),
      create: jest.fn().mockImplementation(({ data }) => {
        const t = { id: `team-${Date.now()}-${Math.random()}`, ...data };
        inMemoryTeams.push(t);
        return Promise.resolve(t);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const idx = inMemoryTeams.findIndex((t) => t.id === where.id);
        if (idx !== -1) {
          inMemoryTeams[idx] = { ...inMemoryTeams[idx], ...data };
          return Promise.resolve(inMemoryTeams[idx]);
        }
        return Promise.resolve(null);
      }),
    },
  };

  beforeEach(async () => {
    inMemoryDistricts = [];
    inMemoryDs = [];
    inMemoryGn = [];
    inMemoryTeams = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AreaService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AreaService>(AreaService);
  });

  describe('25 Districts Seeding (Appendix E)', () => {
    it('seeds all 25 districts with trilingual names', async () => {
      expect(SRI_LANKA_25_DISTRICTS.length).toBe(25);

      const count = await service.seedDistricts();
      expect(count).toBe(25);
      expect(inMemoryDistricts.length).toBe(25);

      const colombo = inMemoryDistricts.find((d) => d.nameEn === 'Colombo');
      expect(colombo).toBeDefined();
      expect(colombo.nameSi).toBe('කොළඹ');
      expect(colombo.nameTa).toBe('கொழும்பு');

      const jaffna = inMemoryDistricts.find((d) => d.nameEn === 'Jaffna');
      expect(jaffna).toBeDefined();
      expect(jaffna.nameSi).toBe('යාපනය');
      expect(jaffna.nameTa).toBe('யாழ்ப்பாணம்');
    });

    it('idempotently avoids duplicating already seeded districts', async () => {
      await service.seedDistricts();
      const secondRun = await service.seedDistricts();
      expect(secondRun).toBe(0);
      expect(inMemoryDistricts.length).toBe(25);
    });
  });

  describe('Area & Team Hierarchy CRUD', () => {
    it('creates DS division, GN division, and Teams with member limits', async () => {
      // Seed districts
      await service.seedDistricts();
      const colombo = inMemoryDistricts.find((d) => d.nameEn === 'Colombo');

      // 1. Create DS division
      const ds = await service.createDivisionalSecretariat({
        districtId: colombo.id,
        nameEn: 'Thimbirigasyaya',
        nameSi: 'තිඹිරිගස්යාය',
        nameTa: 'திம்பிரிகஸ்யாய',
        sdoName: 'A. B. Perera',
      });
      expect(ds.id).toBeDefined();
      expect(ds.nameEn).toBe('Thimbirigasyaya');

      // 2. Create GN division
      const gn = await service.createGnDivision({
        dsId: ds.id,
        gnNumber: '514A',
        gnName: 'Kirulapone',
        secretaryName: 'C. D. Silva',
        secretaryContact: '+94771234567',
        secretaryEmail: 'silva@example.com',
      });
      expect(gn.id).toBeDefined();
      expect(gn.gnNumber).toBe('514A');

      // 3. Create Team with maxMembers = 15
      const team = await service.createTeam({
        gnId: gn.id,
        teamNo: 1,
        maxMembers: 15,
      });
      expect(team.teamNo).toBe(1);
      expect(team.maxMembers).toBe(15);

      // 4. Update team limit
      const updated = await service.updateTeam(team.id, { maxMembers: 20 });
      expect(updated.maxMembers).toBe(20);
    });
  });

  describe('Pilot Area CSV Import Helper (M1.7 Done when criterion)', () => {
    it('loads pilot area hierarchy and provisions initial teams from CSV', async () => {
      const sampleCsv = `
district,ds_division,gn_number,gn_name,secretary_name,secretary_contact,secretary_email,sdo_name,initial_teams,max_members_per_team
Colombo,Thimbirigasyaya,514A,Kirulapone,Nimal Perera,+94771234567,nimal@example.com,Sunil Jayakody,2,10
Colombo,Thimbirigasyaya,514B,Pamankada,Sunethra Silva,+94772345678,sunethra@example.com,Sunil Jayakody,3,15
Kalutara,Panadura,675,Wekada,Kamal Fernando,+94773456789,kamal@example.com,Sarath Perera,1,10
      `.trim();

      const result = await service.importPilotAreaFromCsv(sampleCsv);

      expect(result.rowCount).toBe(3);
      expect(result.importedDistricts).toBe(2); // Colombo, Kalutara
      expect(result.importedDs).toBe(2); // Thimbirigasyaya, Panadura
      expect(result.importedGn).toBe(3); // 514A, 514B, 675
      expect(result.importedTeams).toBe(6); // 2 + 3 + 1 = 6 teams

      // Verify provisioned teams
      expect(inMemoryTeams.length).toBe(6);
      const teamWith15 = inMemoryTeams.find((t) => t.maxMembers === 15);
      expect(teamWith15).toBeDefined();
    });
  });
});
