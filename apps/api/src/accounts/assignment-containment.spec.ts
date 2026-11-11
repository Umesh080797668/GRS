/**
 * Assignment containment tests.
 * Verifies that the scope checks in AssignmentService.assertCanAssign()
 * never go wide — a DC cannot assign outside their district, an SDA outside
 * their DS, etc. This is the same class of containment invariant as account
 * creation (account-creation.spec.ts).
 */
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { AssignmentService } from './assignment.service';
import { UserRole } from '../common/scope/scope.types';

// ── Minimal PrismaService stub ────────────────────────────────────────────────
const makePrisma = (overrides: Partial<any> = {}) => ({
  profile: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  gnDivision: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'gn-1',
      dsId: 'ds-1',
      ds: { districtId: 'district-1' },
    }),
  },
  divisionalSecretariat: {
    findUnique: jest.fn().mockResolvedValue({ id: 'ds-1', districtId: 'district-1' }),
  },
  district: {
    findUnique: jest.fn().mockResolvedValue({ id: 'district-1' }),
  },
  team: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'team-1',
      gnId: 'gn-1',
      gn: { dsId: 'ds-1', ds: { districtId: 'district-1' } },
    }),
    update: jest.fn(),
  },
  accountAssignment: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'aa-1' }),
    update: jest.fn(),
  },
  profileAssignment: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
  },
  accountAudit: {
    create: jest.fn(),
    createMany: jest.fn(),
  },
  refreshToken: {
    updateMany: jest.fn(),
  },
  $transaction: jest.fn().mockImplementation(async (fn: any) =>
    fn({
      profile: { update: jest.fn(), findUnique: jest.fn() },
      accountAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'aa-1' }),
        update: jest.fn(),
      },
      profileAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      team: { update: jest.fn() },
      accountAudit: { create: jest.fn(), createMany: jest.fn() },
      refreshToken: { updateMany: jest.fn() },
    }),
  ),
  ...overrides,
});

const activeProfile = (role: UserRole = UserRole.cdc_secretary) => ({
  id: 'profile-target',
  role,
  isActive: true,
  districtId: 'district-1',
  dsId: 'ds-1',
  gnId: 'gn-1',
  teamId: null,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeService(prismaOverrides?: Partial<any>) {
  const prisma = makePrisma(prismaOverrides);
  const svc = new AssignmentService(prisma as any);
  return { svc, prisma };
}

function dcScope(districtId = 'district-1'): any {
  return { userId: 'actor-dc', role: UserRole.dc, districtId, dsId: null, gnId: null, teamId: null };
}

function sdaScope(dsId = 'ds-1', districtId = 'district-1'): any {
  return { userId: 'actor-sda', role: UserRole.sda, districtId, dsId, gnId: null, teamId: null };
}

function superAdminScope(): any {
  return { userId: 'actor-sa', role: UserRole.super_admin, districtId: null, dsId: null, gnId: null, teamId: null };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AssignmentService — containment', () => {
  describe('DC scope', () => {
    it('allows assigning a GN inside own district', async () => {
      const { svc, prisma } = makeService();
      prisma.profile.findUnique.mockResolvedValue(activeProfile());
      await expect(
        svc.assign(dcScope('district-1'), 'profile-target', { gnId: 'gn-1' }),
      ).resolves.toBeDefined();
    });

    it('BLOCKS assigning a GN in a different district', async () => {
      const { svc, prisma } = makeService({
        gnDivision: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'gn-other',
            dsId: 'ds-other',
            ds: { districtId: 'district-OTHER' },
          }),
        },
      });
      prisma.profile.findUnique.mockResolvedValue(activeProfile());
      await expect(
        svc.assign(dcScope('district-1'), 'profile-target', { gnId: 'gn-other' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('BLOCKS DC with no districtId from assigning anything', async () => {
      const { svc, prisma } = makeService();
      prisma.profile.findUnique.mockResolvedValue(activeProfile());
      const noScope = { userId: 'actor-dc', role: UserRole.dc, districtId: null };
      await expect(
        svc.assign(noScope as any, 'profile-target', { gnId: 'gn-1' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('BLOCKS assigning a DS outside own district', async () => {
      const { svc, prisma } = makeService({
        divisionalSecretariat: {
          findUnique: jest.fn().mockResolvedValue({ id: 'ds-other', districtId: 'district-OTHER' }),
        },
      });
      prisma.profile.findUnique.mockResolvedValue(activeProfile());
      await expect(
        svc.assign(dcScope('district-1'), 'profile-target', { dsId: 'ds-other' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('SDA scope', () => {
    it('allows assigning a GN inside own DS', async () => {
      const { svc, prisma } = makeService();
      prisma.profile.findUnique.mockResolvedValue(activeProfile());
      await expect(
        svc.assign(sdaScope(), 'profile-target', { gnId: 'gn-1' }),
      ).resolves.toBeDefined();
    });

    it('BLOCKS assigning a GN in a different DS', async () => {
      const { svc, prisma } = makeService({
        gnDivision: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'gn-other',
            dsId: 'ds-OTHER',
            ds: { districtId: 'district-1' },
          }),
        },
      });
      prisma.profile.findUnique.mockResolvedValue(activeProfile());
      await expect(
        svc.assign(sdaScope('ds-1'), 'profile-target', { gnId: 'gn-other' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('BLOCKS SDA with no dsId from assigning anything', async () => {
      const { svc, prisma } = makeService();
      prisma.profile.findUnique.mockResolvedValue(activeProfile());
      const noScope = { userId: 'actor-sda', role: UserRole.sda, districtId: 'district-1', dsId: null };
      await expect(
        svc.assign(noScope as any, 'profile-target', { gnId: 'gn-1' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cdc_secretary / team_member scope', () => {
    it('BLOCKS cdc_secretary from assigning territory', async () => {
      const { svc } = makeService();
      const secretaryScope = { userId: 'actor', role: UserRole.cdc_secretary, teamId: 'team-1', gnId: 'gn-1' };
      await expect(
        svc.assign(secretaryScope as any, 'some-profile', { gnId: 'gn-1' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('BLOCKS team_member from assigning territory', async () => {
      const { svc } = makeService();
      const memberScope = { userId: 'actor', role: UserRole.team_member, teamId: 'team-1' };
      await expect(
        svc.assign(memberScope as any, 'some-profile', { gnId: 'gn-1' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('super_admin scope', () => {
    it('allows assigning any GN', async () => {
      const { svc, prisma } = makeService();
      prisma.profile.findUnique.mockResolvedValue(activeProfile());
      await expect(
        svc.assign(superAdminScope(), 'profile-target', { gnId: 'gn-1' }),
      ).resolves.toBeDefined();
    });
  });

  describe('no territory', () => {
    it('BLOCKS assignment with no territory field', async () => {
      const { svc, prisma } = makeService();
      prisma.profile.findUnique.mockResolvedValue(activeProfile());
      await expect(
        svc.assign(superAdminScope(), 'profile-target', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('BLOCKS assignment with multiple territory fields', async () => {
      const { svc, prisma } = makeService();
      prisma.profile.findUnique.mockResolvedValue(activeProfile());
      await expect(
        svc.assign(superAdminScope(), 'profile-target', { gnId: 'gn-1', dsId: 'ds-1' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('endAssignment', () => {
    it('clears cache columns and bumps tokenVersion', async () => {
      const updateMock = jest.fn().mockResolvedValue({});
      const { svc, prisma } = makeService({
        $transaction: jest.fn().mockImplementation(async (fn: any) =>
          fn({
            accountAssignment: {
              findFirst: jest.fn().mockResolvedValue({ id: 'aa-1', profileId: 'profile-target' }),
              update: jest.fn().mockResolvedValue({ id: 'aa-1', validTo: new Date() }),
            },
            profile: { update: updateMock },
            refreshToken: { updateMany: jest.fn() },
            accountAudit: { create: jest.fn() },
          }),
        ),
      });
      prisma.profile.findUnique.mockResolvedValue(activeProfile());
      const saScope = superAdminScope();
      await svc.endAssignment(saScope, 'profile-target');
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'profile-target' } }),
      );
      const data = updateMock.mock.calls[0][0].data;
      expect(data.gnId).toBeNull();
      expect(data.dsId).toBeNull();
      expect(data.districtId).toBeNull();
      expect(data.teamId).toBeNull();
      expect(data.tokenVersion).toEqual({ increment: 1 });
    });

    it('ends only the targeted assignment for a multi-GN cdc_secretary and switches cache to remaining GN', async () => {
      const aaUpdateMock = jest.fn().mockResolvedValue({ id: 'aa-2', validTo: new Date() });
      const paUpdateMock = jest.fn().mockResolvedValue({});
      const profileUpdateMock = jest.fn().mockResolvedValue({});
      const refreshUpdateManyMock = jest.fn().mockResolvedValue({ count: 1 });

      const aa1 = {
        id: 'aa-1',
        profileId: 'profile-sec-a',
        districtId: 'district-1',
        dsId: 'ds-1',
        gnId: 'gn-1',
        teamId: 'team-1',
        validTo: null,
      };
      const aa2 = {
        id: 'aa-2',
        profileId: 'profile-sec-a',
        districtId: 'district-1',
        dsId: 'ds-1',
        gnId: 'gn-2',
        teamId: 'team-2',
        validTo: null,
      };

      const txMock = {
        accountAssignment: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(aa2) // lookup aa-2 to end
            .mockResolvedValueOnce(aa1), // remaining active lookup
          update: aaUpdateMock,
        },
        profileAssignment: {
          findMany: jest.fn().mockResolvedValue([{ id: 'pa-2', profileId: 'profile-sec-a', gnId: 'gn-2', validTo: null }]),
          update: paUpdateMock,
        },
        team: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        profile: { update: profileUpdateMock },
        refreshToken: { updateMany: refreshUpdateManyMock },
        accountAudit: { create: jest.fn() },
      };

      const { svc, prisma } = makeService({
        $transaction: jest.fn().mockImplementation(async (fn: any) => fn(txMock)),
      });
      prisma.profile.findUnique.mockResolvedValue({
        ...activeProfile(UserRole.cdc_secretary),
        id: 'profile-sec-a',
      });

      await svc.endAssignment(superAdminScope(), 'profile-sec-a', { assignmentId: 'aa-2' });

      expect(aaUpdateMock).toHaveBeenCalledTimes(1);
      expect(aaUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'aa-2' } }));
      expect(paUpdateMock).toHaveBeenCalledTimes(1);
      expect(paUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'pa-2' } }));

      expect(profileUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'profile-sec-a' },
          data: expect.objectContaining({
            gnId: 'gn-1',
            dsId: 'ds-1',
            districtId: 'district-1',
            teamId: 'team-1',
            tokenVersion: { increment: 1 },
          }),
        }),
      );
      expect(refreshUpdateManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { profileId: 'profile-sec-a', activeGnId: 'gn-2', revokedAt: null },
        }),
      );
    });

    it('throws NO_ACTIVE_ASSIGNMENT when targeted assignmentId does not exist', async () => {
      const { svc, prisma } = makeService({
        $transaction: jest.fn().mockImplementation(async (fn: any) =>
          fn({
            accountAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
          }),
        ),
      });
      prisma.profile.findUnique.mockResolvedValue(activeProfile());

      await expect(
        svc.endAssignment(superAdminScope(), 'profile-target', { assignmentId: 'missing-aa' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('multi-GN CDC Secretary assignments & handover', () => {
    it('adds a 2nd GN division to the same cdc_secretary without closing their 1st GN', async () => {
      const aaUpdateMock = jest.fn();
      const aaCreateMock = jest.fn().mockResolvedValue({ id: 'aa-2', gnId: 'gn-2' });
      const paUpdateMock = jest.fn();
      const paCreateMock = jest.fn().mockResolvedValue({ id: 'pa-2', gnId: 'gn-2' });

      const txMock = {
        profile: { update: jest.fn().mockResolvedValue({}) },
        accountAssignment: {
          findMany: jest.fn().mockImplementation(async ({ where }: any) => {
            if (where?.profileId === 'sec-a') {
              return [{ id: 'aa-1', profileId: 'sec-a', gnId: 'gn-1', validTo: null }];
            }
            return [];
          }),
          create: aaCreateMock,
          update: aaUpdateMock,
        },
        profileAssignment: {
          findMany: jest.fn().mockResolvedValue([]),
          create: paCreateMock,
          update: paUpdateMock,
        },
        team: { update: jest.fn(), updateMany: jest.fn() },
        accountAudit: { create: jest.fn() },
        refreshToken: { updateMany: jest.fn() },
      };

      const { svc, prisma } = makeService({
        gnDivision: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'gn-2',
            dsId: 'ds-1',
            ds: { districtId: 'district-1' },
          }),
        },
        $transaction: jest.fn().mockImplementation(async (fn: any) => fn(txMock)),
      });
      prisma.profile.findUnique.mockResolvedValue({
        ...activeProfile(UserRole.cdc_secretary),
        id: 'sec-a',
      });

      const res = await svc.assign(superAdminScope(), 'sec-a', { gnId: 'gn-2' });
      expect(res).toEqual(expect.objectContaining({ id: 'aa-2', gnId: 'gn-2' }));
      // Existing gn-1 assignment MUST stay open
      expect(aaUpdateMock).not.toHaveBeenCalled();
      expect(paUpdateMock).not.toHaveBeenCalled();
      expect(aaCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ profileId: 'sec-a', gnId: 'gn-2' }),
        }),
      );
      expect(paCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ profileId: 'sec-a', gnId: 'gn-2' }),
        }),
      );
    });

    it('hands over only the target GN from previous CDC Secretary while preserving their other GNs', async () => {
      const aaUpdateMock = jest.fn().mockResolvedValue({});
      const paUpdateMock = jest.fn().mockResolvedValue({});
      const aaCreateMock = jest.fn().mockResolvedValue({ id: 'aa-3', profileId: 'sec-b', gnId: 'gn-2' });
      const paCreateMock = jest.fn().mockResolvedValue({ id: 'pa-3', profileId: 'sec-b', gnId: 'gn-2' });
      const profileUpdateMock = jest.fn().mockResolvedValue({});
      const refreshUpdateManyMock = jest.fn().mockResolvedValue({ count: 1 });

      const secAGn1 = {
        id: 'aa-1',
        profileId: 'sec-a',
        districtId: 'district-1',
        dsId: 'ds-1',
        gnId: 'gn-1',
        teamId: 'team-1',
        validTo: null,
      };
      const secAGn2 = {
        id: 'aa-2',
        profileId: 'sec-a',
        districtId: 'district-1',
        dsId: 'ds-1',
        gnId: 'gn-2',
        teamId: 'team-2',
        validTo: null,
        profile: { role: UserRole.cdc_secretary },
      };

      const txMock = {
        profile: { update: profileUpdateMock },
        accountAssignment: {
          findMany: jest.fn().mockImplementation(async ({ where }: any) => {
            if (where?.gnId === 'gn-2') return [secAGn2];
            if (where?.profileId === 'sec-b') return [];
            return [];
          }),
          findFirst: jest.fn().mockResolvedValue(secAGn1),
          create: aaCreateMock,
          update: aaUpdateMock,
        },
        profileAssignment: {
          findMany: jest.fn().mockImplementation(async ({ where }: any) => {
            if (where?.gnId === 'gn-2' && where?.profileId?.not === 'sec-b') {
              return [{ id: 'pa-2', profileId: 'sec-a', gnId: 'gn-2', teamId: 'team-2', validTo: null }];
            }
            return [];
          }),
          create: paCreateMock,
          update: paUpdateMock,
        },
        team: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        accountAudit: { create: jest.fn() },
        refreshToken: { updateMany: refreshUpdateManyMock },
      };

      const { svc, prisma } = makeService({
        gnDivision: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'gn-2',
            dsId: 'ds-1',
            ds: { districtId: 'district-1' },
          }),
        },
        $transaction: jest.fn().mockImplementation(async (fn: any) => fn(txMock)),
      });
      prisma.profile.findUnique.mockResolvedValue({
        ...activeProfile(UserRole.cdc_secretary),
        id: 'sec-b',
      });

      await svc.assign(superAdminScope(), 'sec-b', { gnId: 'gn-2' });

      expect(paUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'pa-2' } }));
      expect(aaUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'aa-2' } }));
      expect(aaUpdateMock).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'aa-1' } }));
      expect(profileUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sec-a' },
          data: expect.objectContaining({ gnId: 'gn-1', teamId: 'team-1', tokenVersion: { increment: 1 } }),
        }),
      );
      expect(refreshUpdateManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { profileId: 'sec-a', activeGnId: 'gn-2', revokedAt: null },
        }),
      );
    });

    it('keeps single active assignment for team_member and does not write profile_assignments', async () => {
      const aaUpdateMock = jest.fn().mockResolvedValue({});
      const aaCreateMock = jest.fn().mockResolvedValue({ id: 'aa-tm-2' });
      const paCreateMock = jest.fn();

      const txMock = {
        profile: { update: jest.fn().mockResolvedValue({}) },
        accountAssignment: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'aa-tm-1', profileId: 'tm-1', gnId: 'gn-1', teamId: 'team-1', validTo: null },
          ]),
          create: aaCreateMock,
          update: aaUpdateMock,
        },
        profileAssignment: {
          findMany: jest.fn().mockResolvedValue([]),
          create: paCreateMock,
          update: jest.fn(),
        },
        team: { update: jest.fn() },
        accountAudit: { create: jest.fn() },
        refreshToken: { updateMany: jest.fn() },
      };

      const { svc, prisma } = makeService({
        team: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'team-2',
            gnId: 'gn-2',
            gn: { dsId: 'ds-1', ds: { districtId: 'district-1' } },
          }),
          update: jest.fn(),
        },
        $transaction: jest.fn().mockImplementation(async (fn: any) => fn(txMock)),
      });
      prisma.profile.findUnique.mockResolvedValue({
        ...activeProfile(UserRole.team_member),
        id: 'tm-1',
      });

      await svc.assign(superAdminScope(), 'tm-1', { teamId: 'team-2' });

      expect(aaUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'aa-tm-1' } }));
      expect(aaCreateMock).toHaveBeenCalledTimes(1);
      expect(paCreateMock).not.toHaveBeenCalled();
    });

    it('transfers one specific GN from multi-GN sec-a to multi-GN sec-b without closing other GNs on either secretary', async () => {
      const aaUpdateMock = jest.fn().mockResolvedValue({});
      const paUpdateMock = jest.fn().mockResolvedValue({});
      const aaCreateMock = jest.fn().mockResolvedValue({ id: 'aa-4', profileId: 'sec-b', gnId: 'gn-2' });
      const paCreateMock = jest.fn().mockResolvedValue({ id: 'pa-4', profileId: 'sec-b', gnId: 'gn-2' });
      const profileUpdateMock = jest.fn().mockResolvedValue({});

      const aa1 = {
        id: 'aa-1',
        profileId: 'sec-a',
        districtId: 'district-1',
        dsId: 'ds-1',
        gnId: 'gn-1',
        teamId: null,
        validTo: null,
      };
      const aa2 = {
        id: 'aa-2',
        profileId: 'sec-a',
        districtId: 'district-1',
        dsId: 'ds-1',
        gnId: 'gn-2',
        teamId: null,
        validTo: null,
      };
      const secBGn3 = {
        id: 'aa-b3',
        profileId: 'sec-b',
        districtId: 'district-1',
        dsId: 'ds-1',
        gnId: 'gn-3',
        teamId: null,
        validTo: null,
      };

      const txMock = {
        profile: { update: profileUpdateMock },
        accountAssignment: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(aa2) // target assignmentId aa-2
            .mockResolvedValueOnce(aa1), // remaining for sec-a
          findMany: jest.fn().mockImplementation(async ({ where }: any) => {
            if (where?.profileId === 'sec-b') return [secBGn3];
            return [];
          }),
          create: aaCreateMock,
          update: aaUpdateMock,
        },
        profileAssignment: {
          findMany: jest.fn().mockImplementation(async ({ where }: any) => {
            if (where?.profileId === 'sec-a' && where?.gnId === 'gn-2') {
              return [{ id: 'pa-2', profileId: 'sec-a', gnId: 'gn-2', validTo: null }];
            }
            return [];
          }),
          create: paCreateMock,
          update: paUpdateMock,
        },
        team: { update: jest.fn(), updateMany: jest.fn() },
        accountAudit: { create: jest.fn(), createMany: jest.fn() },
        refreshToken: { updateMany: jest.fn() },
      };

      const { svc, prisma } = makeService({
        gnDivision: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'gn-2',
            dsId: 'ds-1',
            ds: { districtId: 'district-1' },
          }),
        },
        $transaction: jest.fn().mockImplementation(async (fn: any) => fn(txMock)),
      });
      prisma.profile.findUnique
        .mockResolvedValueOnce({ ...activeProfile(UserRole.cdc_secretary), id: 'sec-a' })
        .mockResolvedValueOnce({ ...activeProfile(UserRole.cdc_secretary), id: 'sec-b' });

      await svc.transfer(superAdminScope(), 'sec-a', {
        toProfileId: 'sec-b',
        assignmentId: 'aa-2',
      });

      expect(aaUpdateMock).toHaveBeenCalledTimes(1);
      expect(aaUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'aa-2' } }));
      expect(paUpdateMock).toHaveBeenCalledTimes(1);
      expect(paUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'pa-2' } }));
      expect(profileUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sec-a' },
          data: expect.objectContaining({ gnId: 'gn-1' }),
        }),
      );
      expect(aaCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ profileId: 'sec-b', gnId: 'gn-2' }),
        }),
      );
      expect(paCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ profileId: 'sec-b', gnId: 'gn-2' }),
        }),
      );
    });
  });
});
