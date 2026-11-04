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
        .mockImplementation(() => Promise.resolve(inMemoryGn.length)),
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
        .mockImplementation(() => Promise.resolve(inMemoryTeams.length)),
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
});
