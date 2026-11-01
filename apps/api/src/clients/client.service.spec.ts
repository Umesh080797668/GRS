import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ClientService } from './client.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope/scope.service';
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
        if (where.teamId) results = results.filter((c) => c.teamId === where.teamId);
        if (where.collectedBy)
          results = results.filter((c) => c.collectedBy === where.collectedBy);
        if (where.deletedAt === null)
          results = results.filter((c) => c.deletedAt === null);
        return Promise.resolve(results);
      }),
      count: jest.fn().mockImplementation(({ where }) => {
        let results = [...mockClients];
        if (where.teamId) results = results.filter((c) => c.teamId === where.teamId);
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
    $transaction: jest.fn().mockImplementation(async (cb) => {
      return cb(mockPrisma);
    }),
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

      const updated = await service.updateClient(cdcSecretaryScope, 'client-1', {
        name: 'Corrected Beneficiary Name',
        correctionReason: 'Typo fixed per NIC presentation',
      });

      expect(updated.name).toBe('Corrected Beneficiary Name');
      expect(updated.serverVersion).toBe(2);

      // Verify client_audit entry
      expect(mockAuditLogs.length).toBe(1);
      expect(mockAuditLogs[0].clientId).toBe('client-1');
      expect(mockAuditLogs[0].actorId).toBe(cdcSecretaryScope.userId);
      expect(mockAuditLogs[0].reason).toBe('Typo fixed per NIC presentation');
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
});
