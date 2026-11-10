/**
 * Assignment containment tests.
 * Verifies that the scope checks in AssignmentService.assertCanAssign()
 * never go wide — a DC cannot assign outside their district, an SDA outside
 * their DS, etc. This is the same class of containment invariant as account
 * creation (account-creation.spec.ts).
 */
import { ForbiddenException, BadRequestException } from '@nestjs/common';
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
  });
});
