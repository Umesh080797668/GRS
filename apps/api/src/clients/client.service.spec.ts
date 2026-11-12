import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClientService } from './client.service';
import { ListClientsDto } from './dto/client.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope/scope.service';
import { LookupService } from '../lookups/lookup.service';
import { AppConfigService } from '../config/app-config.service';
import { CANONICAL_LOOKUPS } from '../lookups/lookup.data';
import { UserRole, ScopeContext } from '../common/scope/scope.types';

describe('ClientService (M4.4 Team Records & Decision C2/C13 Corrections)', () => {
  let service: ClientService;

  const mockTeamId = '33333333-3333-3333-3333-333333333333';
  const mockOtherTeamId = '44444444-4444-4444-4444-444444444444';
  const mockHouseholdId = 'house-001';

  const cdcSecretaryScope: ScopeContext = {
    userId: 'user-cdc-sec',
    role: UserRole.cdc_secretary,
    teamId: mockTeamId,
  };

  const teamMemberScope: ScopeContext = {
    userId: 'user-member-1',
    role: UserRole.team_member,
    teamId: mockTeamId,
  };

  let mockClients: any[] = [];
  let mockAuditLogs: any[] = [];

  const mockPrisma: any = {
    client: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const found = mockClients.find((c) => c.id === where.id);
        return Promise.resolve(found || null);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        let results = [...mockClients];
        if (where.teamId)
          results = results.filter((c) => c.teamId === where.teamId);
        if (where.collectedBy)
          results = results.filter((c) => c.collectedBy === where.collectedBy);
        if (where.deletedAt === null)
          results = results.filter((c) => c.deletedAt === null);
        return Promise.resolve(results);
      }),
      count: jest.fn().mockImplementation(({ where }) => {
        let results = [...mockClients];
        if (where.teamId)
          results = results.filter((c) => c.teamId === where.teamId);
        if (where.collectedBy)
          results = results.filter((c) => c.collectedBy === where.collectedBy);
        if (where.deletedAt === null)
          results = results.filter((c) => c.deletedAt === null);
        return Promise.resolve(results.length);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const index = mockClients.findIndex((c) => c.id === where.id);
        if (index === -1) throw new Error('Not found');
        const updated = {
          ...mockClients[index],
          ...data,
          serverVersion: data.serverVersion?.increment
            ? mockClients[index].serverVersion + 1
            : mockClients[index].serverVersion,
        };
        mockClients[index] = updated;
        return Promise.resolve(updated);
      }),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        const found = mockClients.find(
          (c) => c.contentHash === where.contentHash,
        );
        return Promise.resolve(found || null);
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        const created = { id: 'created-' + Date.now(), ...data };
        mockClients.push(created);
        return Promise.resolve(created);
      }),
    },
    household: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'h-1',
        teamId: mockTeamId,
        gnId: 'gn-1',
        dsId: 'ds-1',
        districtId: 'dist-1',
        address: '123 Test St',
        deletedAt: null,
      }),
    },
    team: {
      update: jest.fn().mockResolvedValue({ id: mockTeamId }),
    },
    clientAudit: {
      create: jest.fn().mockImplementation(({ data }) => {
        mockAuditLogs.push(data);
        return Promise.resolve(data);
      }),
    },
    appSetting: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    duplicateCandidate: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn().mockImplementation(async (cb) => {
      return cb(mockPrisma);
    }),
  };

  const mockActiveLookups = new Map<string, Set<string>>();
  for (const item of CANONICAL_LOOKUPS) {
    if (item.isActive ?? true) {
      let set = mockActiveLookups.get(item.category);
      if (!set) {
        set = new Set<string>();
        mockActiveLookups.set(item.category, set);
      }
      set.add(item.code);
    }
  }

  const mockLookupService = {
    getActiveLookupCodesByCategory: jest
      .fn()
      .mockResolvedValue(mockActiveLookups),
  };

  const mockAppConfigService = {
    getConsentVersion: jest.fn().mockResolvedValue('consent.v0'),
    getConfig: jest.fn().mockResolvedValue({ consentVersion: 'consent.v0' }),
    getSetting: jest.fn().mockResolvedValue('consent.v0'),
  };

  beforeEach(async () => {
    mockClients = [];
    mockAuditLogs = [];
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientService,
        { provide: PrismaService, useValue: mockPrisma },
        ScopeService,
        { provide: LookupService, useValue: mockLookupService },
        { provide: AppConfigService, useValue: mockAppConfigService },
      ],
    }).compile();

    service = module.get<ClientService>(ClientService);
  });

  describe('Team Records Access & Keyset Filtering', () => {
    it('Level 4 sees all records entered by their team', async () => {
      mockClients.push(
        {
          id: 'client-1',
          name: 'Beneficiary 1',
          teamId: mockTeamId,
          collectedBy: 'user-member-1',
          deletedAt: null,
          serverVersion: 1,
        },
        {
          id: 'client-2',
          name: 'Beneficiary 2',
          teamId: mockTeamId,
          collectedBy: 'user-member-2',
          deletedAt: null,
          serverVersion: 1,
        },
        {
          id: 'client-3',
          name: 'Other Team Beneficiary',
          teamId: mockOtherTeamId,
          collectedBy: 'user-other',
          deletedAt: null,
          serverVersion: 1,
        },
      );

      const res = await service.getClients(cdcSecretaryScope, {});
      expect(res.clients.length).toBe(2);
      expect(res.clients.map((c) => c.id)).toEqual(['client-1', 'client-2']);
    });
  });

  describe('Decision C2 / C13 Record Corrections with Audit Trail', () => {
    it('Decision C2: Level 5 (team member) is rejected when attempting to edit synced record', async () => {
      mockClients.push({
        id: 'client-1',
        name: 'Beneficiary 1',
        teamId: mockTeamId,
        collectedBy: teamMemberScope.userId,
        deletedAt: null,
        serverVersion: 1,
      });

      await expect(
        service.updateClient(teamMemberScope, 'client-1', {
          name: 'Edited Name',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Decision C2 & C13: Level 4 can correct a record from their team and generates an audit log in client_audit', async () => {
      mockClients.push({
        id: 'client-1',
        name: 'Old Beneficiary Name',
        teamId: mockTeamId,
        collectedBy: 'user-member-1',
        deletedAt: null,
        serverVersion: 1,
      });

      const updated = await service.updateClient(
        cdcSecretaryScope,
        'client-1',
        {
          name: 'Corrected Beneficiary Name',
          correctionReason: 'Typo fixed per NIC presentation',
        },
      );

      expect(updated.name).toBe('Corrected Beneficiary Name');
      expect(updated.serverVersion).toBe(2);

      // Verify client_audit entry
      expect(mockAuditLogs.length).toBe(1);
      expect(mockAuditLogs[0].clientId).toBe('client-1');
      expect(mockAuditLogs[0].changedBy).toBe(cdcSecretaryScope.userId);
      expect(mockAuditLogs[0].reason).toBe('Typo fixed per NIC presentation');
      expect(updated.contentHash).toBeDefined();
    });

    it('validates age, phone, and dropdown codes, and recomputes contentHash on update', async () => {
      mockClients.push({
        id: 'client-val-1',
        name: 'Beneficiary Name',
        age: 25,
        gender: 'F',
        teamId: mockTeamId,
        householdId: 'h-1',
        collectedBy: 'user-member-1',
        deletedAt: null,
        serverVersion: 1,
        contentHash: 'old-content-hash',
      });

      // Invalid age
      await expect(
        service.updateClient(cdcSecretaryScope, 'client-val-1', {
          age: 150,
        }),
      ).rejects.toThrow(BadRequestException);

      // Invalid lookup code
      await expect(
        service.updateClient(cdcSecretaryScope, 'client-val-1', {
          highestEducation: 'INVALID_EDU_CODE',
        }),
      ).rejects.toThrow(BadRequestException);

      // Valid update updates contentHash
      const updated = await service.updateClient(
        cdcSecretaryScope,
        'client-val-1',
        {
          age: 30,
          highestEducation: 'EDU_AL_PASSED',
        },
      );
      expect(updated.age).toBe(30);
      expect(updated.highestEducation).toBe('EDU_AL_PASSED');
      expect(updated.contentHash).not.toBe('old-content-hash');
    });

    it('Level 4 cannot correct records belonging to another team', async () => {
      mockClients.push({
        id: 'client-other',
        name: 'Other Team Person',
        teamId: mockOtherTeamId,
        collectedBy: 'user-other-agent',
        deletedAt: null,
        serverVersion: 1,
      });

      await expect(
        service.updateClient(cdcSecretaryScope, 'client-other', {
          name: 'Attempted Change',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createClient validation & idempotency', () => {
    it('rejects createClient if consentGiven is false or missing', async () => {
      await expect(
        service.createClient(cdcSecretaryScope, {
          householdId: 'h-1',
          name: 'Person Without Consent',
          age: 25,
          gender: 'M',
          consentGiven: false,
          infoProvidedBy: 'self' as any,
          hasSpecialNeeds: false,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects createClient if consentVersion is missing or mismatched', async () => {
      // Missing consentVersion
      await expect(
        service.createClient(cdcSecretaryScope, {
          householdId: 'h-1',
          name: 'Person No Consent Version',
          age: 25,
          gender: 'M',
          consentGiven: true,
          infoProvidedBy: 'self' as any,
          hasSpecialNeeds: false,
        } as any),
      ).rejects.toMatchObject({
        response: { code: 'CONSENT_REQUIRED' },
      });

      // Mismatched consentVersion
      await expect(
        service.createClient(cdcSecretaryScope, {
          householdId: 'h-1',
          name: 'Person Wrong Consent Version',
          age: 25,
          gender: 'M',
          consentGiven: true,
          consentVersion: 'consent.v999',
          infoProvidedBy: 'self' as any,
          hasSpecialNeeds: false,
        } as any),
      ).rejects.toMatchObject({
        response: { code: 'CONSENT_REQUIRED' },
      });
    });

    it('rejects createClient if lookup code is unknown or inactive (INVALID_LOOKUP)', async () => {
      await expect(
        service.createClient(cdcSecretaryScope, {
          householdId: 'h-1',
          name: 'Person Invalid Lookup',
          age: 25,
          gender: 'M',
          consentGiven: true,
          consentVersion: 'consent.v0',
          highestEducation: 'INVALID_EDU_CODE',
          infoProvidedBy: 'self' as any,
          hasSpecialNeeds: false,
        } as any),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_LOOKUP' },
      });
    });

    it('rejects updateClient if lookup code is unknown or inactive (INVALID_LOOKUP)', async () => {
      mockClients.push({
        id: 'client-to-edit',
        householdId: 'h-1',
        name: 'Existing Client',
        age: 30,
        gender: 'M',
        teamId: mockTeamId,
        serverVersion: 1,
        collectedBy: 'user-member-1',
        deletedAt: null,
      });

      await expect(
        service.updateClient(cdcSecretaryScope, 'client-to-edit', {
          highestEducation: 'NON_EXISTENT_EDU',
        } as any),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_LOOKUP' },
      });
    });

    it('creates client with deterministic contentHash and returns existing on retry (idempotent)', async () => {
      const dto = {
        householdId: 'h-1',
        name: 'Jane Silva',
        age: 28,
        gender: 'F',
        consentGiven: true,
        consentVersion: 'consent.v0',
        infoProvidedBy: 'self' as any,
        hasSpecialNeeds: false,
      };

      const first = await service.createClient(cdcSecretaryScope, dto as any);
      expect(first.contentHash).toBeDefined();
      expect(first.name).toBe('Jane Silva');
      const initialCount = mockClients.length;

      // Retry same payload
      const second = await service.createClient(cdcSecretaryScope, dto as any);
      expect(second.id).toBe(first.id);
      expect(mockClients.length).toBe(initialCount);
    });

    it('getClients: preserves territorial scope when search is present (does not overwrite scope OR)', async () => {
      const dcScope: ScopeContext = {
        userId: 'dc-user',
        role: UserRole.dc,
        districtId: 'district-1',
      };

      const findManySpy = jest.spyOn(mockPrisma.client, 'findMany');

      await service.getClients(dcScope, {
        search: 'Kamal',
        limit: 25,
      });

      expect(findManySpy).toHaveBeenCalled();
      const lastCallArgs = findManySpy.mock.calls[
        findManySpy.mock.calls.length - 1
      ][0] as any;
      const where = lastCallArgs.where;

      // Territorial scope OR must be preserved inside AND alongside search OR
      expect(where.OR).toBeUndefined();
      expect(where.AND).toBeDefined();
      expect(Array.isArray(where.AND)).toBe(true);

      const scopeOr = where.AND.find(
        (item: any) =>
          item.OR &&
          item.OR.some((cond: any) => cond.districtId === 'district-1'),
      );
      expect(scopeOr).toBeDefined();

      const searchOr = where.AND.find(
        (item: any) =>
          item.OR && item.OR.some((cond: any) => cond.name !== undefined),
      );
      expect(searchOr).toBeDefined();
    });

    it('getClients: uses cursor and skip: 1 for keyset pagination', async () => {
      const superAdminScope: ScopeContext = {
        userId: 'super-admin',
        role: UserRole.super_admin,
      };

      const findManySpy = jest.spyOn(mockPrisma.client, 'findMany');

      await service.getClients(superAdminScope, {
        cursor: 'client-cursor-456',
        limit: 50,
      });

      expect(findManySpy).toHaveBeenCalled();
      const lastCallArgs = findManySpy.mock.calls[
        findManySpy.mock.calls.length - 1
      ][0] as any;
      expect(lastCallArgs.cursor).toEqual({ id: 'client-cursor-456' });
      expect(lastCallArgs.skip).toBe(1);
    });

    it('getClients: pages correctly across 250 clients with limit 100, preserving rows at positions 101 and 201', async () => {
      const superAdminScope: ScopeContext = {
        userId: 'super-admin',
        role: UserRole.super_admin,
      };

      const all250Clients = Array.from({ length: 250 }, (_, i) => {
        const pad = String(i + 1).padStart(3, '0');
        return {
          id: `client-${pad}`,
          name: `Client ${pad}`,
          teamId: mockTeamId,
          householdId: 'h-1',
          collectedBy: 'user-member-1',
          deletedAt: null,
          serverVersion: 1,
          createdAt: new Date('2026-11-01T10:00:00.000Z'),
        };
      });

      mockPrisma.client.findMany.mockImplementation((args: any) => {
        let startIndex = 0;
        if (args.cursor) {
          const cursorIndex = all250Clients.findIndex(
            (c) => c.id === args.cursor.id,
          );
          expect(cursorIndex).toBeGreaterThanOrEqual(0);
          startIndex = cursorIndex + (args.skip ?? 0);
        }
        return Promise.resolve(
          all250Clients.slice(startIndex, startIndex + args.take),
        );
      });
      mockPrisma.client.count.mockResolvedValue(250);

      const collectedIds: string[] = [];
      let currentCursor: string | undefined = undefined;
      let pages = 0;

      do {
        pages++;
        const res = await service.getClients(superAdminScope, {
          limit: 100,
          cursor: currentCursor,
        });

        for (const c of res.clients) {
          collectedIds.push(c.id);
        }

        currentCursor = res.nextCursor;
      } while (currentCursor);

      expect(pages).toBe(3);
      expect(collectedIds.length).toBe(250);
      expect(new Set(collectedIds).size).toBe(250);

      // Verify that positions 101 and 201 are quietly NOT lost!
      expect(collectedIds[99]).toBe('client-100');
      expect(collectedIds[100]).toBe('client-101');
      expect(collectedIds[199]).toBe('client-200');
      expect(collectedIds[200]).toBe('client-201');
    });

    it('getClients: does not execute count() by default and omits totalCount', async () => {
      const superAdminScope: ScopeContext = {
        userId: 'super-admin',
        role: UserRole.super_admin,
      };

      const countSpy = jest.spyOn(mockPrisma.client, 'count');
      countSpy.mockClear();

      const res = await service.getClients(superAdminScope, { limit: 10 });
      expect(countSpy).not.toHaveBeenCalled();
      expect(res.totalCount).toBeUndefined();
    });

    it('getClients: executes count() only when includeCount is true', async () => {
      const superAdminScope: ScopeContext = {
        userId: 'super-admin',
        role: UserRole.super_admin,
      };

      const countSpy = jest.spyOn(mockPrisma.client, 'count');
      countSpy.mockClear();
      mockPrisma.client.count.mockResolvedValueOnce(42);

      const res = await service.getClients(superAdminScope, {
        limit: 10,
        includeCount: true,
      });
      expect(countSpy).toHaveBeenCalledTimes(1);
      expect(res.totalCount).toBe(42);
    });

    it('ListClientsDto transforms string query parameter limit to number', async () => {
      const dto = plainToInstance(ListClientsDto, { limit: '20' });
      expect(typeof dto.limit).toBe('number');
      expect(dto.limit).toBe(20);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('deleteClient: soft-deletes in scope, logs client_audit, dismisses open duplicates, and blocks L5/cross-team', async () => {
      mockClients.push(
        {
          id: 'client-del-1',
          householdId: mockHouseholdId,
          teamId: mockTeamId,
          collectedBy: 'user-member-1',
          name: 'Delete Target',
          deletedAt: null,
          serverVersion: 1,
        },
        {
          id: 'client-del-other',
          householdId: 'house-002',
          teamId: mockOtherTeamId,
          collectedBy: 'user-other',
          name: 'Other Team Target',
          deletedAt: null,
          serverVersion: 1,
        },
      );

      await expect(
        service.deleteClient(teamMemberScope, 'client-del-1', {
          reason: 'Enumerator attempt',
        }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.deleteClient(cdcSecretaryScope, 'client-del-other', {
          reason: 'Cross team attempt',
        }),
      ).rejects.toThrow(ForbiddenException);

      const res = await service.deleteClient(cdcSecretaryScope, 'client-del-1', {
        reason: 'Duplicate manual cleanup',
      });
      expect(res).toEqual({ success: true, id: 'client-del-1' });
      const deletedRow = mockClients.find((c) => c.id === 'client-del-1');
      expect(deletedRow.deletedAt).toBeInstanceOf(Date);
      expect(deletedRow.serverVersion).toBe(2);
      expect(mockPrisma.duplicateCandidate.updateMany).toHaveBeenCalled();
      expect(mockPrisma.team.update).toHaveBeenCalled();
      expect(
        mockAuditLogs.some(
          (a) =>
            a.clientId === 'client-del-1' &&
            a.reason === 'Duplicate manual cleanup',
        ),
      ).toBe(true);
    });
  });
});
