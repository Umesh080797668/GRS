import { Test, TestingModule } from '@nestjs/testing';
import { ScopeService } from './scope.service';
import { AccountService } from '../../accounts/account.service';
import { ClientService } from '../../clients/client.service';
import { HouseholdService } from '../../households/household.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, ScopeContext } from './scope.types';
import { ForbiddenException, ParseUUIDPipe } from '@nestjs/common';
import { PrismaClientExceptionFilter } from '../filters/prisma-client-exception.filter';

describe('Scope Bypass Protection across List Endpoints × Roles × Filters', () => {
  let scopeService: ScopeService;
  let accountService: AccountService;
  let clientService: ClientService;
  let householdService: HouseholdService;
  let mockPrisma: any;

  const mockUsers: Record<string, ScopeContext> = {
    super_admin: { userId: 'admin-1', role: UserRole.super_admin },
    admin: { userId: 'adm-1', role: UserRole.admin },
    cg: { userId: 'cg-1', role: UserRole.cg },
    dc: { userId: 'dc-1', role: UserRole.dc, districtId: 'district-colombo' },
    sda: {
      userId: 'sda-1',
      role: UserRole.sda,
      districtId: 'district-colombo',
      dsId: 'ds-colombo-1',
    },
    cdc_secretary: {
      userId: 'sec-1',
      role: UserRole.cdc_secretary,
      districtId: 'district-colombo',
      dsId: 'ds-colombo-1',
      gnId: 'gn-colombo-1',
      teamId: 'team-colombo-1',
    },
    team_member: {
      userId: 'mem-1',
      role: UserRole.team_member,
      districtId: 'district-colombo',
      dsId: 'ds-colombo-1',
      gnId: 'gn-colombo-1',
      teamId: 'team-colombo-1',
    },
  };

  beforeEach(async () => {
    mockPrisma = {
      profile: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      client: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      household: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScopeService,
        {
          provide: AccountService,
          useFactory: (prisma, scope) => {
            const credService = {
              generateInitialPassword: () => ({
                raw: 'P@ss1234',
                display: 'P@ss1234',
              }),
              hashInitialPassword: async () => 'hashed',
              generateUserCode: () => 'GRS1234567890',
            } as any;
            return new AccountService(prisma, credService, scope);
          },
          inject: [PrismaService, ScopeService],
        },
        {
          provide: ClientService,
          useFactory: (prisma, scope) => new ClientService(prisma, scope),
          inject: [PrismaService, ScopeService],
        },
        {
          provide: HouseholdService,
          useFactory: (prisma, scope) => new HouseholdService(prisma, scope),
          inject: [PrismaService, ScopeService],
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    scopeService = module.get<ScopeService>(ScopeService);
    accountService = module.get<AccountService>(AccountService);
    clientService = module.get<ClientService>(ClientService);
    householdService = module.get<HouseholdService>(HouseholdService);
  });

  describe('ScopeService.combineConditions helper', () => {
    it('returns empty object when no conditions provided', () => {
      expect(scopeService.combineConditions()).toEqual({});
      expect(scopeService.combineConditions(null, undefined, {})).toEqual({});
    });

    it('returns single condition when only one non-empty condition is provided', () => {
      expect(scopeService.combineConditions({ teamId: 'team-1' })).toEqual({
        teamId: 'team-1',
      });
    });

    it('ANDs multiple conditions preserving individual ORs and flat keys', () => {
      const flat1 = { teamId: 'team-1' };
      const flat2 = { role: 'team_member' };
      expect(scopeService.combineConditions(flat1, flat2)).toEqual({
        AND: [flat1, flat2],
      });

      const scopeCond = {
        deletedAt: null,
        OR: [{ districtId: 'colombo' }, { collectedBy: 'user-1' }],
      };
      const beneficiaryCond = { OR: [{ isEpf: true }, { isEtf: true }] };
      const searchCond = { OR: [{ name: { contains: 'test' } }] };

      const combined = scopeService.combineConditions(
        scopeCond,
        beneficiaryCond,
        searchCond,
      );
      expect(combined).toEqual({
        AND: [scopeCond, beneficiaryCond, searchCond],
      });
    });
  });

  describe('GET /v1/accounts (findAccounts) Scope Security', () => {
    it('cdc_secretary: cannot widen scope with ?teamId=<other_team>', async () => {
      const secretary = mockUsers.cdc_secretary;
      await expect(
        accountService.findAccounts(secretary, { teamId: 'team-other-999' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cdc_secretary: missing teamId fails closed with ForbiddenException, never nationwide', async () => {
      const secretaryWithoutTeam: ScopeContext = {
        userId: 'sec-rogue',
        role: UserRole.cdc_secretary,
        teamId: null,
      };
      await expect(
        accountService.findAccounts(secretaryWithoutTeam, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cdc_secretary: query with search preserves teamId scope', async () => {
      const secretary = mockUsers.cdc_secretary;
      await accountService.findAccounts(secretary, { search: 'Kamal' });

      expect(mockPrisma.profile.findMany).toHaveBeenCalledTimes(1);
      const callArg = mockPrisma.profile.findMany.mock.calls[0][0];
      expect(callArg.where.AND).toBeDefined();
      expect(callArg.where.AND).toContainEqual({ teamId: secretary.teamId });
      expect(callArg.where.AND.some((c: any) => c.OR !== undefined)).toBe(true);
    });

    it('team_member: sees only own account regardless of query filters', async () => {
      const member = mockUsers.team_member;
      await accountService.findAccounts(member, { search: 'Test' });

      const callArg = mockPrisma.profile.findMany.mock.calls[0][0];
      expect(callArg.where.AND).toBeDefined();
      expect(callArg.where.AND).toContainEqual({ id: member.userId });
      expect(callArg.where.AND.some((c: any) => c.OR !== undefined)).toBe(true);
    });

    it('dc: strictly bound to districtId scope', async () => {
      const dc = mockUsers.dc;
      await accountService.findAccounts(dc, { role: UserRole.team_member });

      const callArg = mockPrisma.profile.findMany.mock.calls[0][0];
      expect(callArg.where).toEqual({
        AND: [{ districtId: dc.districtId }, { role: UserRole.team_member }],
      });
    });

    it('sda: strictly bound to dsId scope', async () => {
      const sda = mockUsers.sda;
      await accountService.findAccounts(sda, { role: UserRole.team_member });

      const callArg = mockPrisma.profile.findMany.mock.calls[0][0];
      expect(callArg.where).toEqual({
        AND: [{ dsId: sda.dsId }, { role: UserRole.team_member }],
      });
    });

    it('super_admin: national scope with optional filters', async () => {
      const sa = mockUsers.super_admin;
      await accountService.findAccounts(sa, { teamId: 'team-any' });

      const callArg = mockPrisma.profile.findMany.mock.calls[0][0];
      expect(callArg.where).toEqual({ teamId: 'team-any' });
    });
  });

  describe('GET /v1/clients (getClients) Scope Security & ?beneficiary=epf OR Preservation', () => {
    it('dc: ?beneficiary=epf does NOT overwrite scope OR filter', async () => {
      const dc = mockUsers.dc;
      await clientService.getClients(dc, { beneficiary: 'epf' });

      expect(mockPrisma.client.findMany).toHaveBeenCalledTimes(1);
      const callArg = mockPrisma.client.findMany.mock.calls[0][0];

      // Scope filter has district OR, beneficiary has epf OR. Both MUST be in AND!
      expect(callArg.where).toEqual({
        AND: [
          {
            deletedAt: null,
            OR: [{ districtId: dc.districtId }, { collectedBy: dc.userId }],
          },
          {
            OR: [{ isEpf: true }, { isEtf: true }],
          },
        ],
      });
    });

    it('sda: ?beneficiary=epf does NOT overwrite scope OR filter', async () => {
      const sda = mockUsers.sda;
      await clientService.getClients(sda, { beneficiary: 'epf' });

      const callArg = mockPrisma.client.findMany.mock.calls[0][0];
      expect(callArg.where).toEqual({
        AND: [
          {
            deletedAt: null,
            OR: [{ dsId: sda.dsId }, { collectedBy: sda.userId }],
          },
          {
            OR: [{ isEpf: true }, { isEtf: true }],
          },
        ],
      });
    });

    it('dc: ?beneficiary=epf AND search both preserve scope OR in three-way AND', async () => {
      const dc = mockUsers.dc;
      await clientService.getClients(dc, {
        beneficiary: 'epf',
        search: 'Sunil',
      });

      const callArg = mockPrisma.client.findMany.mock.calls[0][0];
      expect(callArg.where.AND).toBeDefined();
      expect(callArg.where.AND).toHaveLength(3);
      expect(callArg.where.AND[0]).toEqual({
        deletedAt: null,
        OR: [{ districtId: dc.districtId }, { collectedBy: dc.userId }],
      });
      expect(callArg.where.AND[1]).toEqual({
        OR: [{ isEpf: true }, { isEtf: true }],
      });
      expect(callArg.where.AND[2]).toEqual({
        OR: [
          { name: { contains: 'Sunil', mode: 'insensitive' } },
          { phoneRaw: { contains: 'Sunil' } },
          { phoneE164: { contains: 'Sunil' } },
        ],
      });
    });

    it('cdc_secretary: cannot query another team with ?teamId=<other_team>', async () => {
      const secretary = mockUsers.cdc_secretary;
      await expect(
        clientService.getClients(secretary, { teamId: 'team-other' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cdc_secretary: missing teamId fails closed with ForbiddenException', async () => {
      const secretaryWithoutTeam: ScopeContext = {
        userId: 'sec-rogue',
        role: UserRole.cdc_secretary,
        teamId: null,
      };
      await expect(
        clientService.getClients(secretaryWithoutTeam, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('team_member: strictly limited to collectedBy = userId, cannot see others in team', async () => {
      const member = mockUsers.team_member;
      await clientService.getClients(member, { search: 'Test' });

      const callArg = mockPrisma.client.findMany.mock.calls[0][0];
      expect(callArg.where.AND).toBeDefined();
      expect(callArg.where.AND).toContainEqual({
        collectedBy: member.userId,
        deletedAt: null,
      });
      expect(callArg.where.AND.some((c: any) => c.OR !== undefined)).toBe(true);
    });
  });

  describe('GET /v1/households (getHouseholds) Scope Security', () => {
    it('cdc_secretary: cannot query another GN with ?gnId=<other_gn>', async () => {
      const secretary = mockUsers.cdc_secretary;
      await expect(
        householdService.getHouseholds(secretary, { gnId: 'gn-other' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cdc_secretary: missing gnId fails closed with ForbiddenException', async () => {
      const secretaryWithoutGn: ScopeContext = {
        userId: 'sec-rogue',
        role: UserRole.cdc_secretary,
        gnId: null,
      };
      await expect(
        householdService.getHouseholds(secretaryWithoutGn, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cdc_secretary: search preserves GN scope inside where condition', async () => {
      const secretary = mockUsers.cdc_secretary;
      await householdService.getHouseholds(secretary, { search: 'H123' });

      const callArg = mockPrisma.household.findMany.mock.calls[0][0];
      expect(callArg.where.AND).toBeDefined();
      expect(callArg.where.AND).toContainEqual({
        gnId: secretary.gnId,
        deletedAt: null,
      });
      expect(callArg.where.AND.some((c: any) => c.OR !== undefined)).toBe(true);
    });

    it('dc: search preserves district OR scope inside AND', async () => {
      const dc = mockUsers.dc;
      await householdService.getHouseholds(dc, { search: 'H123' });

      const callArg = mockPrisma.household.findMany.mock.calls[0][0];
      expect(callArg.where.AND).toBeDefined();
      expect(callArg.where.AND[0]).toEqual({
        deletedAt: null,
        OR: [{ districtId: dc.districtId }, { createdBy: dc.userId }],
      });
    });
  });

  describe('UUID Validation & Global Exception Filter (Bug C)', () => {
    it('ParseUUIDPipe rejects malformed UUID with 400 Bad Request', async () => {
      const pipe = new ParseUUIDPipe();
      await expect(
        pipe.transform('not-a-uuid', { type: 'param' }),
      ).rejects.toThrow();
    });

    it('ParseUUIDPipe accepts valid UUID', async () => {
      const pipe = new ParseUUIDPipe();
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const result = await pipe.transform(validUuid, { type: 'param' });
      expect(result).toBe(validUuid);
    });

    it('PrismaClientExceptionFilter catches Prisma P2023 / invalid UUID error and returns 400', () => {
      const filter = new PrismaClientExceptionFilter();
      let statusCalledWith = 0;
      let jsonCalledWith: any = null;

      const mockResponse = {
        status: (s: number) => {
          statusCalledWith = s;
          return {
            json: (payload: any) => {
              jsonCalledWith = payload;
            },
          };
        },
      };

      const mockHost: any = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
        }),
      };

      filter.catch(
        { code: 'P2023', message: 'Inconsistent column data' },
        mockHost,
      );

      expect(statusCalledWith).toBe(400);
      expect(jsonCalledWith).toEqual({
        statusCode: 400,
        message: 'Invalid UUID format in parameter or query',
        error: 'Bad Request',
      });
    });

    it('PrismaClientExceptionFilter catches Prisma P2002 unique constraint error and returns 409 Conflict', () => {
      const filter = new PrismaClientExceptionFilter();
      let statusCalledWith = 0;
      let jsonCalledWith: any = null;

      const mockResponse = {
        status: (s: number) => {
          statusCalledWith = s;
          return {
            json: (payload: any) => {
              jsonCalledWith = payload;
            },
          };
        },
      };

      const mockHost: any = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
        }),
      };

      filter.catch(
        { code: 'P2002', meta: { target: ['user_code'] } },
        mockHost,
      );

      expect(statusCalledWith).toBe(409);
      expect(jsonCalledWith).toEqual({
        statusCode: 409,
        message: 'Unique constraint violation on user_code',
        error: 'Conflict',
      });
    });

    it('PrismaClientExceptionFilter logs and reports non-HTTP unhandled errors as 500 to Sentry', () => {
      const filter = new PrismaClientExceptionFilter();
      let statusCalledWith = 0;
      let jsonCalledWith: any = null;

      const mockResponse = {
        status: (s: number) => {
          statusCalledWith = s;
          return {
            json: (payload: any) => {
              jsonCalledWith = payload;
            },
          };
        },
      };

      const mockHost: any = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
        }),
      };

      const unhandledErr = new Error('Database connection unexpectedly severed');
      filter.catch(unhandledErr, mockHost);

      expect(statusCalledWith).toBe(500);
      expect(jsonCalledWith).toEqual({
        statusCode: 500,
        message: 'Internal server error',
      });
    });

    it('PrismaClientExceptionFilter does NOT map generic DB errors containing "Inconsistent column data" to 400', () => {
      const filter = new PrismaClientExceptionFilter();
      let statusCalledWith = 0;

      const mockResponse = {
        status: (s: number) => {
          statusCalledWith = s;
          return {
            json: () => {},
          };
        },
      };

      const mockHost: any = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
        }),
      };

      // Error without code P2023
      filter.catch(
        new Error('General internal DB warning: Inconsistent column data on table X'),
        mockHost,
      );

      expect(statusCalledWith).toBe(500);
    });
  });
});
