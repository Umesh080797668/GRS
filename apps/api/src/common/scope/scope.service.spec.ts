import { ScopeService } from './scope.service';
import {
  UserRole,
  ScopeContext,
  getRoleRank,
  canCreateRole,
} from './scope.types';
import { ForbiddenException } from '@nestjs/common';

describe('ScopeService & Role Hierarchy', () => {
  let service: ScopeService;

  beforeEach(() => {
    service = new ScopeService();
  });

  describe('Role Hierarchy & Ranking (Section 3 / 5.1)', () => {
    it('should rank roles in strict descending administrative order', () => {
      expect(getRoleRank(UserRole.super_admin)).toBeGreaterThan(
        getRoleRank(UserRole.admin),
      );
      expect(getRoleRank(UserRole.admin)).toBeGreaterThan(
        getRoleRank(UserRole.cg),
      );
      expect(getRoleRank(UserRole.cg)).toBeGreaterThan(
        getRoleRank(UserRole.dc),
      );
      expect(getRoleRank(UserRole.dc)).toBeGreaterThan(
        getRoleRank(UserRole.sda),
      );
      expect(getRoleRank(UserRole.sda)).toBeGreaterThan(
        getRoleRank(UserRole.cdc_secretary),
      );
      expect(getRoleRank(UserRole.cdc_secretary)).toBeGreaterThan(
        getRoleRank(UserRole.team_member),
      );
    });

    it('should enforce account creation matrix (Section 6.1)', () => {
      // Super admin can create all roles
      expect(canCreateRole(UserRole.super_admin, UserRole.cdc_secretary)).toBe(
        true,
      );
      expect(canCreateRole(UserRole.super_admin, UserRole.team_member)).toBe(
        true,
      );

      // CDC Secretary (Level 4) can ONLY create Level 5 team members
      expect(canCreateRole(UserRole.cdc_secretary, UserRole.team_member)).toBe(
        true,
      );
      expect(
        canCreateRole(UserRole.cdc_secretary, UserRole.cdc_secretary),
      ).toBe(false);
      expect(canCreateRole(UserRole.cdc_secretary, UserRole.super_admin)).toBe(
        false,
      );

      // Team Member (Level 5) can create nobody
      expect(canCreateRole(UserRole.team_member, UserRole.team_member)).toBe(
        false,
      );
    });
  });

  describe('Household Scope Filters (Invariant 4 / Section 5.4)', () => {
    it('Super admin sees all non-deleted households without territorial constraint', () => {
      const scope: ScopeContext = { userId: 'u0', role: UserRole.super_admin };
      const filter = service.getHouseholdScopeFilter(scope);
      expect(filter).toEqual({ deletedAt: null });
    });

    it('District Admin (dc) filter scopes strictly to districtId or self-created', () => {
      const scope: ScopeContext = {
        userId: 'u-dc',
        role: UserRole.dc,
        districtId: 'dist-colombo',
      };
      const filter = service.getHouseholdScopeFilter(scope);
      expect(filter).toEqual({
        deletedAt: null,
        OR: [{ districtId: 'dist-colombo' }, { createdBy: 'u-dc' }],
      });
    });

    it('District Admin without districtId throws ForbiddenException', () => {
      const scope: ScopeContext = {
        userId: 'u-dc',
        role: UserRole.dc,
        districtId: null,
      };
      expect(() => service.getHouseholdScopeFilter(scope)).toThrow(
        ForbiddenException,
      );
    });

    it('CDC Secretary (Level 4) and Team Member (Level 5) scope to assigned teamId', () => {
      const scopeL4: ScopeContext = {
        userId: 'u-sec',
        role: UserRole.cdc_secretary,
        teamId: 'team-1',
      };
      const filterL4 = service.getHouseholdScopeFilter(scopeL4);
      expect(filterL4).toEqual({
        deletedAt: null,
        OR: [{ teamId: 'team-1' }, { createdBy: 'u-sec' }],
      });
    });
  });

  describe('Client Scope Filters (Section 5.4 / Invariant 4)', () => {
    it('Level 5 team member is strictly restricted to own collected entries', () => {
      const scope: ScopeContext = {
        userId: 'agent-101',
        role: UserRole.team_member,
        teamId: 'team-1',
      };
      const filter = service.getClientScopeFilter(scope);
      expect(filter).toEqual({
        deletedAt: null,
        collectedBy: 'agent-101',
      });
    });

    it('Level 4 CDC Secretary sees own team entries plus own collected entries', () => {
      const scope: ScopeContext = {
        userId: 'sec-202',
        role: UserRole.cdc_secretary,
        teamId: 'team-1',
      };
      const filter = service.getClientScopeFilter(scope);
      expect(filter).toEqual({
        deletedAt: null,
        OR: [{ teamId: 'team-1' }, { collectedBy: 'sec-202' }],
      });
    });
  });

  describe('Synced Record Edit Permissions (Decision C2 & C13)', () => {
    const client = { teamId: 'team-1', collectedBy: 'agent-101' };

    it('Level 5 cannot edit synced records under any circumstance', () => {
      const scope: ScopeContext = {
        userId: 'agent-101',
        role: UserRole.team_member,
        teamId: 'team-1',
      };
      expect(service.canEditSyncedClient(scope, client)).toBe(false);
    });

    it('Level 4 CDC Secretary can edit synced records of their own team', () => {
      const scope: ScopeContext = {
        userId: 'sec-202',
        role: UserRole.cdc_secretary,
        teamId: 'team-1',
      };
      expect(service.canEditSyncedClient(scope, client)).toBe(true);
    });

    it('Level 4 CDC Secretary cannot edit synced records of another team', () => {
      const scope: ScopeContext = {
        userId: 'sec-other',
        role: UserRole.cdc_secretary,
        teamId: 'team-99',
      };
      expect(service.canEditSyncedClient(scope, client)).toBe(false);
    });

    it('Super Admin (Level 00) can edit any synced record', () => {
      const scope: ScopeContext = {
        userId: 'admin-00',
        role: UserRole.super_admin,
      };
      expect(service.canEditSyncedClient(scope, client)).toBe(true);
    });
  });
});
