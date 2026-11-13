import {
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DuplicateStatus } from '@prisma/client';
import { ScopeService } from '../common/scope/scope.service';
import { ScopeContext, UserRole } from '../common/scope/scope.types';
import { DuplicatesService } from './duplicates.service';
import {
  DuplicateClassificationFilter,
  DuplicateFilterStatus,
} from './dto/duplicate.dto';

describe('DuplicatesService (M6.2 & M6.4)', () => {
  let service: DuplicatesService;
  let prisma: any;
  let scopeService: ScopeService;

  const teamId = '11111111-1111-1111-1111-111111111111';
  const otherTeamId = '22222222-2222-2222-2222-222222222222';
  const gnId = '33333333-3333-3333-3333-333333333333';
  const dsId = '44444444-4444-4444-4444-444444444444';
  const otherDsId = '44444444-4444-4444-4444-444444444449';
  const districtId = '55555555-5555-5555-5555-555555555555';
  const userId = '66666666-6666-6666-6666-666666666666';

  const l3Caller: ScopeContext = {
    userId: '77777777-7777-7777-7777-777777777777',
    role: UserRole.sda,
    dsId,
    districtId,
  };

  const l3NoDsCaller: ScopeContext = {
    userId: '88888888-8888-8888-8888-888888888888',
    role: UserRole.sda,
    districtId,
  };

  const l4Caller: ScopeContext = {
    userId,
    role: UserRole.cdc_secretary,
    teamId,
    gnId,
    dsId,
    districtId,
  };

  const l5Caller: ScopeContext = {
    userId,
    role: UserRole.team_member,
    teamId,
    gnId,
    dsId,
    districtId,
  };

  const l00Caller: ScopeContext = {
    userId,
    role: UserRole.super_admin,
  };

  beforeEach(() => {
    prisma = {
      client: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      duplicateCandidate: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      clientAudit: {
        create: jest.fn(),
      },
      team: {
        updateMany: jest.fn(),
      },
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    scopeService = new ScopeService();
    service = new DuplicatesService(prisma, scopeService);
  });

  describe('Access & Scope Enforcement', () => {
    it('blocks Level 5 team_member from listing duplicates', async () => {
      await expect(service.listDuplicates(l5Caller, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('blocks Level 4 from filtering another teamId', async () => {
      await expect(
        service.listDuplicates(l4Caller, { teamId: otherTeamId }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lists duplicates for Level 4 scoped to own team with openCount and keyset cursor', async () => {
      prisma.duplicateCandidate.findMany.mockResolvedValue([
        {
          id: 'cand-1',
          clientA: 'aaa00000-0000-0000-0000-000000000001',
          clientB: 'bbb00000-0000-0000-0000-000000000002',
          score: 100,
          reasons: { factors: ['same_phone', 'name_match'] },
          status: DuplicateStatus.open,
          reviewedBy: null,
          reviewedAt: null,
          createdAt: new Date('2026-11-11T00:00:00Z'),
          clientARecord: {
            id: 'aaa00000-0000-0000-0000-000000000001',
            name: 'Kavinda Bandara',
            age: 24,
            gender: 'M',
            phoneE164: '+94771234567',
            whatsappE164: null,
            teamId,
            gnId,
            dsId,
            districtId,
            householdId: 'h-1',
            duplicateOf: null,
            createdAt: new Date('2026-11-10T00:00:00Z'),
            household: { id: 'h-1', houseNo: '12', serialNo: 1, gnId },
          },
          clientBRecord: {
            id: 'bbb00000-0000-0000-0000-000000000002',
            name: 'Kavinda Bandara',
            age: 24,
            gender: 'M',
            phoneE164: '+94771234567',
            whatsappE164: null,
            teamId,
            gnId,
            dsId,
            districtId,
            householdId: 'h-1',
            duplicateOf: null,
            createdAt: new Date('2026-11-11T00:00:00Z'),
            household: { id: 'h-1', houseNo: '12', serialNo: 1, gnId },
          },
        },
      ]);
      prisma.duplicateCandidate.count.mockResolvedValue(1);

      const res = await service.listDuplicates(l4Caller, {
        status: DuplicateFilterStatus.open,
        classification: DuplicateClassificationFilter.probable,
        limit: 50,
      });

      expect(res.items).toHaveLength(1);
      expect(res.openCount).toBe(1);
      expect(res.items[0].classification).toBe('probable');
    });
  });

  describe('Post-commit scoring (M6.2)', () => {
    it('queries indexed candidates and upserts canonical ordered pair (clientA < clientB)', async () => {
      const targetId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const existingId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const hhId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

      prisma.client.findMany.mockResolvedValue([
        {
          id: targetId,
          householdId: hhId,
          gnId,
          name: 'Kavinda Bandara',
          nameNorm: 'bandara kavinda',
          age: 24,
          gender: 'M',
          phoneE164: '+94771234567',
          whatsappE164: null,
          deletedAt: null,
          duplicateOf: null,
        },
      ]);

      // Phone lookup, household lookup, gn trigram lookup
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          {
            id: existingId,
            household_id: hhId,
            gn_id: gnId,
            name: 'Kavinda Bandara',
            name_norm: 'bandara kavinda',
            age: 24,
            gender: 'M',
            phone_e164: '+94771234567',
            whatsapp_e164: null,
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.$executeRawUnsafe.mockResolvedValue(1);

      const inserted = await service.scoreCommittedClients([targetId]);
      expect(inserted).toBe(1);
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);

      const sqlCall = prisma.$executeRawUnsafe.mock.calls[0];
      expect(sqlCall[0]).toContain('INSERT INTO "duplicate_candidates"');
      // clientA < clientB ordering
      expect(sqlCall[1]).toBe(existingId);
      expect(sqlCall[2]).toBe(targetId);
      expect(sqlCall[3]).toBeGreaterThanOrEqual(70);
    });
  });

  describe('Confirm & Dismiss workflows (M6.4)', () => {
    const candId = '99999999-9999-9999-9999-999999999999';
    const clientAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const clientBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    const makeCandidate = (override?: Partial<any>) => ({
      id: candId,
      clientA: clientAId,
      clientB: clientBId,
      score: 100,
      reasons: { factors: ['same_phone', 'name_match'] },
      status: DuplicateStatus.open,
      clientARecord: {
        id: clientAId,
        teamId,
        gnId,
        dsId,
        districtId,
        duplicateOf: null,
        createdAt: new Date('2026-11-10T00:00:00Z'),
      },
      clientBRecord: {
        id: clientBId,
        teamId,
        gnId,
        dsId,
        districtId,
        duplicateOf: null,
        createdAt: new Date('2026-11-11T00:00:00Z'),
      },
      ...override,
    });

    it('confirms duplicate by setting clients.duplicate_of, marking candidate confirmed, writing audit, and dirtying team stats', async () => {
      prisma.duplicateCandidate.findUnique.mockResolvedValue(makeCandidate());
      prisma.client.update.mockResolvedValue({
        id: clientBId,
        duplicateOf: clientAId,
      });
      prisma.duplicateCandidate.update.mockResolvedValue({
        id: candId,
        status: DuplicateStatus.confirmed,
      });
      prisma.clientAudit.create.mockResolvedValue({ id: 'audit-1' });
      prisma.team.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.confirmDuplicate(l4Caller, candId, {
        canonicalClientId: clientAId,
      });

      expect(result.status).toBe(DuplicateStatus.confirmed);
      expect(result.canonicalClientId).toBe(clientAId);
      expect(result.duplicateClientId).toBe(clientBId);

      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: clientBId },
        data: {
          duplicateOf: clientAId,
          updatedBy: l4Caller.userId,
        },
      });
      expect(prisma.clientAudit.create).toHaveBeenCalledTimes(1);
      expect(prisma.team.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [teamId] } },
        }),
      );
    });

    it('rejects confirm when canonicalClientId is neither clientA nor clientB', async () => {
      prisma.duplicateCandidate.findUnique.mockResolvedValue(makeCandidate());
      await expect(
        service.confirmDuplicate(l00Caller, candId, {
          canonicalClientId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks Level 4 from confirming another team duplicate', async () => {
      prisma.duplicateCandidate.findUnique.mockResolvedValue(
        makeCandidate({
          clientARecord: {
            id: clientAId,
            teamId: otherTeamId,
            createdAt: new Date(),
          },
          clientBRecord: {
            id: clientBId,
            teamId: otherTeamId,
            createdAt: new Date(),
          },
        }),
      );

      await expect(
        service.confirmDuplicate(l4Caller, candId, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when duplicate candidate does not exist', async () => {
      prisma.duplicateCandidate.findUnique.mockResolvedValue(null);
      await expect(
        service.dismissDuplicate(l00Caller, candId, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('dismisses duplicate candidate cleanly with reviewer metadata', async () => {
      prisma.duplicateCandidate.findUnique.mockResolvedValue(makeCandidate());
      prisma.duplicateCandidate.update.mockResolvedValue({
        id: candId,
        status: DuplicateStatus.dismissed,
        reviewedBy: l4Caller.userId,
      });

      const res = await service.dismissDuplicate(l4Caller, candId, {
        reason: 'Siblings sharing phone',
      });
      expect(res.status).toBe(DuplicateStatus.dismissed);
      expect(prisma.duplicateCandidate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: candId },
          data: expect.objectContaining({
            status: DuplicateStatus.dismissed,
            reviewedBy: l4Caller.userId,
          }),
        }),
      );
    });

    it('allows Level 3 SDA to confirm duplicate candidates across teams within their DS division', async () => {
      prisma.duplicateCandidate.findUnique.mockResolvedValue(
        makeCandidate({
          clientBRecord: {
            id: clientBId,
            teamId: otherTeamId,
            gnId,
            dsId,
            districtId,
            duplicateOf: null,
            createdAt: new Date('2026-11-11T00:00:00Z'),
          },
        }),
      );
      prisma.client.update.mockResolvedValue({
        id: clientBId,
        duplicateOf: clientAId,
      });
      prisma.duplicateCandidate.update.mockResolvedValue({
        id: candId,
        status: DuplicateStatus.confirmed,
      });
      prisma.clientAudit.create.mockResolvedValue({ id: 'audit-sda-1' });
      prisma.team.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.confirmDuplicate(l3Caller, candId, {
        canonicalClientId: clientAId,
        reason: 'Verified across teams in same DS',
      });

      expect(result.status).toBe(DuplicateStatus.confirmed);
      expect(prisma.client.update).toHaveBeenCalled();
    });

    it('rejects Level 3 SDA confirming duplicate candidates outside their DS division or with missing dsId', async () => {
      prisma.duplicateCandidate.findUnique.mockResolvedValue(
        makeCandidate({
          clientARecord: {
            id: clientAId,
            teamId: otherTeamId,
            gnId,
            dsId: otherDsId,
            districtId,
            duplicateOf: null,
            createdAt: new Date('2026-11-10T00:00:00Z'),
          },
          clientBRecord: {
            id: clientBId,
            teamId: otherTeamId,
            gnId,
            dsId: otherDsId,
            districtId,
            duplicateOf: null,
            createdAt: new Date('2026-11-11T00:00:00Z'),
          },
        }),
      );

      await expect(
        service.confirmDuplicate(l3Caller, candId, {}),
      ).rejects.toThrow(ForbiddenException);

      // Even if one client is in caller's DS, duplicate target belonging to another DS is rejected
      prisma.duplicateCandidate.findUnique.mockResolvedValue(
        makeCandidate({
          clientBRecord: {
            id: clientBId,
            teamId: otherTeamId,
            gnId,
            dsId: otherDsId,
            districtId,
            duplicateOf: null,
            createdAt: new Date('2026-11-11T00:00:00Z'),
          },
        }),
      );
      await expect(
        service.confirmDuplicate(l3Caller, candId, {
          canonicalClientId: clientAId,
        }),
      ).rejects.toThrow(ForbiddenException);

      prisma.duplicateCandidate.findUnique.mockResolvedValue(makeCandidate());
      await expect(
        service.confirmDuplicate(l3NoDsCaller, candId, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows Level 3 SDA to dismiss duplicate candidates within their DS division', async () => {
      prisma.duplicateCandidate.findUnique.mockResolvedValue(makeCandidate());
      prisma.duplicateCandidate.update.mockResolvedValue({
        id: candId,
        status: DuplicateStatus.dismissed,
        reviewedBy: l3Caller.userId,
      });

      const res = await service.dismissDuplicate(l3Caller, candId, {
        reason: 'Verified distinct persons in DS division',
      });
      expect(res.status).toBe(DuplicateStatus.dismissed);
    });

    it('rejects Level 3 SDA dismissing duplicate candidates outside their DS division or with missing dsId', async () => {
      prisma.duplicateCandidate.findUnique.mockResolvedValue(
        makeCandidate({
          clientARecord: {
            id: clientAId,
            teamId: otherTeamId,
            dsId: otherDsId,
          },
          clientBRecord: {
            id: clientBId,
            teamId: otherTeamId,
            dsId: otherDsId,
          },
        }),
      );

      await expect(
        service.dismissDuplicate(l3Caller, candId, {}),
      ).rejects.toThrow(ForbiddenException);

      prisma.duplicateCandidate.findUnique.mockResolvedValue(makeCandidate());
      await expect(
        service.dismissDuplicate(l3NoDsCaller, candId, {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
