import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AreaService } from './area.service';
import { AreaController } from './area.controller';
import { CreateDsDto } from './dto/area.dto';
import { ListAccountsDto } from '../accounts/dto/list-accounts.dto';
import { ROLES_KEY } from '../auth/roles.decorator';
import { UserRole } from '../common/scope/scope.types';
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
        const nameEnTarget = String(
          where.nameEn?.equals ?? where.nameEn ?? '',
        ).toLowerCase();
        return Promise.resolve(
          inMemoryDs.find(
            (ds) =>
              ds.districtId === where.districtId &&
              (!where.id?.not || ds.id !== where.id.not) &&
              ds.nameEn.toLowerCase() === nameEnTarget,
          ) || null,
        );
      }),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          inMemoryDs.find((ds) => ds.id === where.id) || null,
        );
      }),
      findMany: jest.fn().mockImplementation(({ select }) => {
        if (select) {
          return Promise.resolve(
            inMemoryDs.map((ds) => {
              const res: any = {};
              for (const k of Object.keys(select)) {
                if (select[k]) res[k] = ds[k];
              }
              return res;
            }),
          );
        }
        return Promise.resolve(inMemoryDs);
      }),
      count: jest
        .fn()
        .mockImplementation(() => Promise.resolve(inMemoryDs.length)),
      create: jest.fn().mockImplementation(({ data }) => {
        const ds = { id: `ds-${Date.now()}-${Math.random()}`, ...data };
        inMemoryDs.push(ds);
        return Promise.resolve(ds);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const idx = inMemoryDs.findIndex((ds) => ds.id === where.id);
        if (idx === -1) return Promise.resolve(null);
        const defined = Object.fromEntries(
          Object.entries(data).filter(([, v]) => v !== undefined),
        );
        inMemoryDs[idx] = { ...inMemoryDs[idx], ...defined };
        return Promise.resolve(inMemoryDs[idx]);
      }),
      delete: jest.fn().mockImplementation(({ where }) => {
        const idx = inMemoryDs.findIndex((ds) => ds.id === where.id);
        if (idx === -1) return Promise.resolve(null);
        const [removed] = inMemoryDs.splice(idx, 1);
        return Promise.resolve(removed);
      }),
    },
    gnDivision: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        const num = where?.gnNumber?.equals ?? where?.gnNumber;
        const name = where?.gnName?.equals ?? where?.gnName;
        return Promise.resolve(
          inMemoryGn.find((gn) => {
            if (where?.id?.not && gn.id === where.id.not) return false;
            if (where?.dsId !== undefined && gn.dsId !== where.dsId) return false;
            if (
              num !== undefined &&
              gn.gnNumber.toLowerCase() !== String(num).toLowerCase()
            ) {
              return false;
            }
            if (
              name !== undefined &&
              gn.gnName.toLowerCase() !== String(name).toLowerCase()
            ) {
              return false;
            }
            return true;
          }) || null,
        );
      }),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.dsId_gnNumber_gnName) {
          return Promise.resolve(
            inMemoryGn.find(
              (gn) =>
                gn.dsId === where.dsId_gnNumber_gnName.dsId &&
                gn.gnNumber === where.dsId_gnNumber_gnName.gnNumber &&
                gn.gnName === where.dsId_gnNumber_gnName.gnName,
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
      findMany: jest.fn().mockImplementation(({ select }) => {
        if (select) {
          return Promise.resolve(
            inMemoryGn.map((gn) => {
              const res: any = {};
              for (const k of Object.keys(select)) {
                if (select[k]) res[k] = gn[k];
              }
              return res;
            }),
          );
        }
        return Promise.resolve(inMemoryGn);
      }),
      count: jest
        .fn()
        .mockImplementation(({ where } = {}) => {
          if (where?.dsId) {
            return Promise.resolve(
              inMemoryGn.filter((g) => g.dsId === where.dsId).length,
            );
          }
          return Promise.resolve(inMemoryGn.length);
        }),
      create: jest.fn().mockImplementation(({ data }) => {
        const gn = { id: `gn-${Date.now()}-${Math.random()}`, ...data };
        inMemoryGn.push(gn);
        return Promise.resolve(gn);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const idx = inMemoryGn.findIndex((gn) => gn.id === where.id);
        if (idx === -1) return Promise.resolve(null);
        const defined = Object.fromEntries(
          Object.entries(data).filter(([, v]) => v !== undefined),
        );
        inMemoryGn[idx] = { ...inMemoryGn[idx], ...defined };
        return Promise.resolve(inMemoryGn[idx]);
      }),
      delete: jest.fn().mockImplementation(({ where }) => {
        const idx = inMemoryGn.findIndex((gn) => gn.id === where.id);
        if (idx === -1) return Promise.resolve(null);
        const [removed] = inMemoryGn.splice(idx, 1);
        return Promise.resolve(removed);
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
      findMany: jest.fn().mockImplementation(({ select }) => {
        if (select) {
          return Promise.resolve(
            inMemoryTeams.map((t) => {
              const res: any = {};
              for (const k of Object.keys(select)) {
                if (select[k]) res[k] = t[k];
              }
              return res;
            }),
          );
        }
        return Promise.resolve(inMemoryTeams);
      }),
      count: jest
        .fn()
        .mockImplementation(({ where } = {}) => {
          if (where?.gnId) {
            return Promise.resolve(
              inMemoryTeams.filter((t) => t.gnId === where.gnId).length,
            );
          }
          return Promise.resolve(inMemoryTeams.length);
        }),
      create: jest.fn().mockImplementation(({ data }) => {
        const t = { id: `team-${Date.now()}-${Math.random()}`, ...data };
        inMemoryTeams.push(t);
        return Promise.resolve(t);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const idx = inMemoryTeams.findIndex((t) => t.id === where.id);
        if (idx !== -1) {
          const defined = Object.fromEntries(
            Object.entries(data).filter(([, v]) => v !== undefined),
          );
          inMemoryTeams[idx] = { ...inMemoryTeams[idx], ...defined };
          return Promise.resolve(inMemoryTeams[idx]);
        }
        return Promise.resolve(null);
      }),
      delete: jest.fn().mockImplementation(({ where }) => {
        const idx = inMemoryTeams.findIndex((t) => t.id === where.id);
        if (idx === -1) return Promise.resolve(null);
        const [removed] = inMemoryTeams.splice(idx, 1);
        return Promise.resolve(removed);
      }),
    },
    profile: { count: jest.fn().mockResolvedValue(0) },
    household: { count: jest.fn().mockResolvedValue(0) },
    client: { count: jest.fn().mockResolvedValue(0) },
    profileAssignment: { count: jest.fn().mockResolvedValue(0) },
    accountAssignment: { count: jest.fn().mockResolvedValue(0) },
    areaStat: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    teamStat: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest
      .fn()
      .mockImplementation((cb) =>
        typeof cb === 'function' ? cb(mockPrisma) : Promise.all(cb),
      ),
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

    it('dry run validates rows without modifying database', async () => {
      const sampleCsv = `
district,ds_division,gn_number,gn_name
Colombo,Thimbirigasyaya,514A,Kirulapone
      `.trim();

      const result = await service.importPilotAreaFromCsv(sampleCsv, true);
      expect(result.dryRun).toBe(true);
      expect(result.rowCount).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(inMemoryDistricts).toHaveLength(0);
      expect(inMemoryGn).toHaveLength(0);
    });

    it('collects errors for rows with fewer than 4 columns and missing values', async () => {
      const badCsv = `
district,ds_division,gn_number,gn_name
Colombo,Thimbirigasyaya
Colombo,Thimbirigasyaya,514A,Kirulapone
      `.trim();

      const result = await service.importPilotAreaFromCsv(badCsv);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].row).toBe(2);
      expect(result.errors[0].error).toContain('fewer than');
      // Entire import was halted due to error
      expect(inMemoryGn).toHaveLength(0);
    });

    it('rejects typo in district name and does not create an invalid district', async () => {
      const typoCsv = `
district,ds_division,gn_number,gn_name
Columbo,Thimbirigasyaya,514A,Kirulapone
      `.trim();

      const result = await service.importPilotAreaFromCsv(typoCsv);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].error).toContain(
        'Invalid district name "Columbo"',
      );
      expect(inMemoryDistricts).toHaveLength(0);
    });

    it('rejects initial_teams exceeding upper bound of 50', async () => {
      const excessiveTeamsCsv = `
district,ds_division,gn_number,gn_name,secretary_name,secretary_contact,secretary_email,sdo_name,initial_teams
Colombo,Thimbirigasyaya,514A,Kirulapone,Nimal Perera,+94771234567,nimal@example.com,Sunil Jayakody,99
      `.trim();

      const result = await service.importPilotAreaFromCsv(excessiveTeamsCsv);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].error).toContain(
        'initial_teams must be between 1 and 50',
      );
      expect(inMemoryTeams).toHaveLength(0);
    });

    it('handles quoted fields in headers and rows correctly', async () => {
      const quotedCsv = `
"district","ds_division","gn_number","gn_name","initial_teams"
"Colombo","Thimbirigasyaya","514A","Kirulapone, West","2"
      `.trim();

      const result = await service.importPilotAreaFromCsv(quotedCsv);
      expect(result.errors).toHaveLength(0);
      expect(result.rowCount).toBe(1);
      expect(inMemoryGn[0].gnName).toBe('Kirulapone, West');
      expect(inMemoryTeams).toHaveLength(2);
    });
  });

  describe('Area Scoping, Field Restriction & Pagination', () => {
    const superAdminScope = {
      userId: 'user-sa',
      role: 'super_admin' as any,
    };

    const dcScope = {
      userId: 'user-dc',
      role: 'dc' as any,
      districtId: 'dist-colombo',
    };

    const sdaScope = {
      userId: 'user-sda',
      role: 'sda' as any,
      districtId: 'dist-colombo',
      dsId: 'ds-thimbiri',
    };

    const secretaryScope = {
      userId: 'user-sec',
      role: 'cdc_secretary' as any,
      districtId: 'dist-colombo',
      dsId: 'ds-thimbiri',
      gnId: 'gn-kirula',
      teamId: 'team-1',
    };

    const memberScope = {
      userId: 'user-agent',
      role: 'team_member' as any,
      districtId: 'dist-colombo',
      dsId: 'ds-thimbiri',
      gnId: 'gn-kirula',
      teamId: 'team-1',
    };

    beforeEach(async () => {
      inMemoryDs = [
        {
          id: 'ds-thimbiri',
          districtId: 'dist-colombo',
          nameEn: 'Thimbirigasyaya',
        },
        { id: 'ds-kaduwela', districtId: 'dist-colombo', nameEn: 'Kaduwela' },
        {
          id: 'ds-galle',
          districtId: 'dist-galle',
          nameEn: 'Galle Four Gravets',
        },
      ];

      inMemoryGn = [
        {
          id: 'gn-kirula',
          dsId: 'ds-thimbiri',
          gnNumber: '514A',
          gnName: 'Kirulapone',
          secretaryName: 'Private Secretary Silva',
          secretaryContact: '+94771112233',
          secretaryEmail: 'silva@cdc.gov.lk',
          nextSerial: 1,
        },
        {
          id: 'gn-pamankada',
          dsId: 'ds-thimbiri',
          gnNumber: '514B',
          gnName: 'Pamankada',
          secretaryName: 'Private Secretary Perera',
          secretaryContact: '+94774445566',
          secretaryEmail: 'perera@cdc.gov.lk',
          nextSerial: 1,
        },
      ];

      inMemoryTeams = [
        { id: 'team-1', gnId: 'gn-kirula', teamNo: 1, maxMembers: 10 },
        { id: 'team-2', gnId: 'gn-kirula', teamNo: 2, maxMembers: 10 },
      ];
    });

    describe('GET /v1/areas/ds scoping & pagination', () => {
      it('super_admin can view all DS divisions and response is keyset-paginated', async () => {
        const result = await service.getDivisionalSecretariats(superAdminScope);
        expect(result.items.length).toBe(3);
        expect(result.limit).toBe(50);
        expect(result.total).toBeUndefined(); // count omitted by default for big-table scale

        const withTotal = await service.getDivisionalSecretariats(
          superAdminScope,
          { includeTotal: true },
        );
        expect(withTotal.total).toBe(3);
      });

      it('dc is scoped to their district and rejected when requesting outside district', async () => {
        const allowed = await service.getDivisionalSecretariats(dcScope);
        expect(allowed.items).toBeDefined();

        await expect(
          service.getDivisionalSecretariats(dcScope, {
            districtId: 'dist-galle',
          }),
        ).rejects.toThrow(
          'Cannot access DS divisions outside assigned district',
        );
      });

      it('sda is scoped to their assigned dsId', async () => {
        const result = await service.getDivisionalSecretariats(sdaScope);
        expect(result.items).toBeDefined();
      });
    });

    describe('GET /v1/areas/gn scoping, field redaction & pagination', () => {
      it('returns only needed fields and strictly omits CDC secretary contact details', async () => {
        const result = await service.getGnDivisions(superAdminScope);
        expect(result.items.length).toBe(2);

        for (const gn of result.items) {
          expect(gn.id).toBeDefined();
          expect(gn.gnNumber).toBeDefined();
          expect(gn.gnName).toBeDefined();
          // Sensitive CDC secretary contact details MUST NOT be exposed in list
          expect((gn as any).secretaryName).toBeUndefined();
          expect((gn as any).secretaryContact).toBeUndefined();
          expect((gn as any).secretaryEmail).toBeUndefined();
        }
      });

      it('team_member is scoped to their own GN division and cannot enumerate others', async () => {
        const result = await service.getGnDivisions(memberScope);
        expect(result.items.length).toBe(2); // in-memory mock returns filtered where
        // Rejects out-of-scope dsId query
        await expect(
          service.getGnDivisions(memberScope, { dsId: 'ds-other' }),
        ).rejects.toThrow('Cannot access GN divisions outside assigned scope');
      });
    });

    describe('GET /v1/areas/teams scoping, role restriction & pagination', () => {
      it('rejects Level 5 team members with 403 Forbidden', async () => {
        await expect(service.getTeams(memberScope)).rejects.toThrow(
          'Level 5 team members cannot list teams',
        );
      });

      it('cdc_secretary can list teams in their assigned GN division with keyset pagination', async () => {
        const result = await service.getTeams(secretaryScope);
        expect(result.items).toBeDefined();
        expect(result.total).toBeUndefined(); // count omitted by default

        const withTotal = await service.getTeams(secretaryScope, {
          includeTotal: true,
        });
        expect(withTotal.total).toBe(2);
      });

      it('cdc_secretary is rejected when querying teams for another GN division', async () => {
        await expect(
          service.getTeams(secretaryScope, { gnId: 'gn-other' }),
        ).rejects.toThrow('Cannot access teams outside assigned GN division');
      });
    });
  });

  describe('Area & Team Creation, CSV Headers, DTOs & Controller Roles', () => {
    const districtId = '11111111-1111-4111-8111-111111111111';

    beforeEach(() => {
      inMemoryDistricts = [
        {
          id: districtId,
          code: 'DIST-COL',
          nameEn: 'Colombo',
          nameSi: 'කොළඹ',
          nameTa: 'கொழும்பு',
        },
      ];
    });

    it('creates a DS division defaulting omitted Sinhala/Tamil names to English and trims values', async () => {
      const ds = await service.createDivisionalSecretariat({
        districtId,
        nameEn: '  Homagama  ',
        sdoName: '  S. Perera  ',
      });

      expect(ds.districtId).toBe(districtId);
      expect(ds.nameEn).toBe('Homagama');
      expect(ds.nameSi).toBe('Homagama');
      expect(ds.nameTa).toBe('Homagama');
      expect(ds.sdoName).toBe('S. Perera');
      expect(inMemoryDs).toHaveLength(1);
    });

    it('creates a DS division preserving explicit Sinhala/Tamil names', async () => {
      const ds = await service.createDivisionalSecretariat({
        districtId,
        nameEn: 'Maharagama',
        nameSi: 'මහරගම',
        nameTa: 'மஹரகம',
      });

      expect(ds.nameSi).toBe('මහරගම');
      expect(ds.nameTa).toBe('மஹரகம');
    });

    it('allows same GN number with different name and same name with different number, rejecting only duplicate (number, name) pairs', async () => {
      const ds = await service.createDivisionalSecretariat({
        districtId,
        nameEn: 'Kesbewa',
      });

      const gn = await service.createGnDivision({
        dsId: ds.id,
        gnNumber: ' 520A ',
        gnName: ' Piliyandala East ',
        secretaryName: ' K. Silva ',
        secretaryContact: ' +94771234567 ',
        secretaryEmail: ' sec@grs.gov.lk ',
      });

      expect(gn.gnNumber).toBe('520A');
      expect(gn.gnName).toBe('Piliyandala East');
      expect(gn.secretaryName).toBe('K. Silva');
      expect(gn.secretaryEmail).toBe('sec@grs.gov.lk');

      // Same GN number, different GN area name -> allowed
      const sameNumDiffName = await service.createGnDivision({
        dsId: ds.id,
        gnNumber: '520A',
        gnName: 'Piliyandala West',
      });
      expect(sameNumDiffName.gnNumber).toBe('520A');
      expect(sameNumDiffName.gnName).toBe('Piliyandala West');

      // Different GN number, same GN area name -> allowed
      const diffNumSameName = await service.createGnDivision({
        dsId: ds.id,
        gnNumber: '520B',
        gnName: 'Piliyandala East',
      });
      expect(diffNumSameName.gnNumber).toBe('520B');
      expect(diffNumSameName.gnName).toBe('Piliyandala East');

      // Both GN number and GN name identical (including case-insensitive) -> rejected
      await expect(
        service.createGnDivision({
          dsId: ds.id,
          gnNumber: '520a',
          gnName: 'piliyandala east',
        }),
      ).rejects.toThrow(
        'GN Division "520a — piliyandala east" already exists in this DS division',
      );
      expect(inMemoryGn).toHaveLength(3);
    });

    it('creates field teams under a GN division and rejects duplicate team numbers', async () => {
      const ds = await service.createDivisionalSecretariat({
        districtId,
        nameEn: 'Padukka',
      });
      const gn = await service.createGnDivision({
        dsId: ds.id,
        gnNumber: '530',
        gnName: 'Padukka Town',
      });

      const team = await service.createTeam({
        gnId: gn.id,
        teamNo: 1,
        maxMembers: 15,
      });

      expect(team.gnId).toBe(gn.id);
      expect(team.teamNo).toBe(1);
      expect(team.maxMembers).toBe(15);

      await expect(
        service.createTeam({
          gnId: gn.id,
          teamNo: 1,
          maxMembers: 10,
        }),
      ).rejects.toThrow('Team 1 already exists in this GN division');
    });

    it('imports pilot CSV with both gn_name and legacy gn_division headers', async () => {
      const legacyCsv = [
        'district,ds_division,gn_division,gn_number,initial_teams',
        'Colombo,Colombo,Kollupitiya,GN-01,2',
      ].join('\n');

      const legacyResult = await service.importPilotAreaFromCsv(
        legacyCsv,
        false,
      );
      expect(legacyResult.rowCount).toBe(1);
      expect(legacyResult.importedGn).toBe(1);
      expect(legacyResult.importedTeams).toBe(2);
      expect(inMemoryGn).toHaveLength(1);
      expect(inMemoryGn[0].gnName).toBe('Kollupitiya');
      expect(inMemoryTeams).toHaveLength(2);

      const standardCsv = [
        'district,ds_division,gn_name,gn_number,initial_teams',
        'Colombo,Colombo,Bambalapitiya,GN-02,1',
        'Colombo,Colombo,Bambalapitiya South,GN-02,1',
      ].join('\n');

      const standardResult = await service.importPilotAreaFromCsv(
        standardCsv,
        false,
      );
      expect(standardResult.rowCount).toBe(2);
      expect(standardResult.importedGn).toBe(2);
      expect(inMemoryGn).toHaveLength(3);
      expect(inMemoryGn[1].gnName).toBe('Bambalapitiya');
      expect(inMemoryGn[2].gnName).toBe('Bambalapitiya South');
      expect(inMemoryTeams).toHaveLength(4);
    });

    it('validates CreateDsDto with optional Sinhala/Tamil names and ListAccountsDto max limit=100', async () => {
      const validDs = plainToInstance(CreateDsDto, {
        districtId,
        nameEn: '  Colombo  ',
      });
      expect(await validate(validDs)).toHaveLength(0);

      const blankDs = plainToInstance(CreateDsDto, {
        districtId,
        nameEn: '   ',
      });
      expect((await validate(blankDs)).length).toBeGreaterThan(0);

      const validAccountsQuery = plainToInstance(ListAccountsDto, {
        limit: '100',
      });
      expect(await validate(validAccountsQuery)).toHaveLength(0);

      const invalidAccountsQuery = plainToInstance(ListAccountsDto, {
        limit: '500',
      });
      const errors = await validate(invalidAccountsQuery);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('allows both super_admin and admin roles on AreaController mutation endpoints', () => {
      const proto = AreaController.prototype;
      for (const methodName of [
        'seedDistricts',
        'createDs',
        'updateDs',
        'deleteDs',
        'createGn',
        'updateGn',
        'deleteGn',
        'createTeam',
        'updateTeam',
        'deleteTeam',
        'importPilotArea',
      ] as const) {
        const roles: UserRole[] = Reflect.getMetadata(
          ROLES_KEY,
          proto[methodName],
        );
        expect(roles).toContain(UserRole.super_admin);
        expect(roles).toContain(UserRole.admin);
      }
    });

    it('supports updating and deleting DS, GN, and Teams while blocking dependency deletion', async () => {
      await service.seedDistricts();
      const colombo = inMemoryDistricts.find((d) => d.nameEn === 'Colombo');
      const superAdminScope = { userId: 'sa-1', role: UserRole.super_admin };

      const ds1 = await service.createDivisionalSecretariat({
        districtId: colombo.id,
        nameEn: 'Homagama',
      });
      const ds2 = await service.createDivisionalSecretariat({
        districtId: colombo.id,
        nameEn: 'Maharagama',
      });

      const updatedDs = await service.updateDivisionalSecretariat(ds1.id, {
        nameEn: 'Homagama North',
        sdoName: 'SDO Silva',
      });
      expect(updatedDs.nameEn).toBe('Homagama North');
      expect(updatedDs.sdoName).toBe('SDO Silva');

      await expect(
        service.updateDivisionalSecretariat(ds2.id, { nameEn: 'homagama north' }),
      ).rejects.toThrow('already exists in this district');

      const gn = await service.createGnDivision({
        dsId: ds1.id,
        gnNumber: '450A',
        gnName: 'Pitipana',
      });

      // CDC secretary cannot rename gnNumber/gnName
      await expect(
        service.updateGnDivision(
          { userId: 'sec-1', role: UserRole.cdc_secretary, gnId: gn.id },
          gn.id,
          { gnName: 'Renamed' },
        ),
      ).rejects.toThrow('GN office secretary contact details');

      const updatedGn = await service.updateGnDivision(superAdminScope, gn.id, {
        gnNumber: '450B',
        gnName: 'Pitipana North',
        secretaryName: 'K. Perera',
      });
      expect(updatedGn.gnNumber).toBe('450B');
      expect(updatedGn.gnName).toBe('Pitipana North');

      const team = await service.createTeam({
        gnId: gn.id,
        teamNo: 1,
        maxMembers: 10,
      });

      // Simulate 4 active members preventing shrink below 4
      mockPrisma.profile.count.mockResolvedValueOnce(4);
      await expect(
        service.updateTeam(team.id, { maxMembers: 3 }),
      ).rejects.toThrow('below 4 active team member');

      const updatedTeam = await service.updateTeam(team.id, {
        teamNo: 2,
        maxMembers: 12,
      });
      expect(updatedTeam.teamNo).toBe(2);
      expect(updatedTeam.maxMembers).toBe(12);

      // Deletion blocked while hierarchy children exist
      await expect(service.deleteGnDivision(gn.id)).rejects.toThrow(
        'Cannot delete GN division',
      );
      await expect(
        service.deleteDivisionalSecretariat(ds1.id),
      ).rejects.toThrow('Cannot delete DS division');

      // Delete bottom-up succeeds cleanly
      await service.deleteTeam(team.id);
      await service.deleteGnDivision(gn.id);
      await service.deleteDivisionalSecretariat(ds1.id);
      expect(inMemoryTeams).toHaveLength(0);
      expect(inMemoryGn).toHaveLength(0);
      expect(inMemoryDs.find((d) => d.id === ds1.id)).toBeUndefined();
    });
  });
});
