import { Injectable, ForbiddenException } from '@nestjs/common';
import { UserRole, ScopeContext } from './scope.types';

@Injectable()
export class ScopeService {
  /**
   * Generates Prisma WHERE filter for querying households according to scope.
   * Ensures zero cross-area leaks per Invariant 4.
   */
  getHouseholdScopeFilter(scope: ScopeContext): Record<string, any> {
    const baseCondition: Record<string, any> = { deletedAt: null };

    switch (scope.role) {
      case UserRole.super_admin:
        return baseCondition;

      case UserRole.admin:
      case UserRole.cg:
        // National scope per Decision C17
        if (scope.districtId) {
          return {
            ...baseCondition,
            OR: [{ districtId: scope.districtId }, { createdBy: scope.userId }],
          };
        }
        return baseCondition;

      case UserRole.dc:
        if (!scope.districtId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message_key: 'errors.scope.missing_district',
          });
        }
        return {
          ...baseCondition,
          OR: [{ districtId: scope.districtId }, { createdBy: scope.userId }],
        };

      case UserRole.sda:
        if (!scope.dsId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message_key: 'errors.scope.missing_ds',
          });
        }
        return {
          ...baseCondition,
          OR: [{ dsId: scope.dsId }, { createdBy: scope.userId }],
        };

      case UserRole.cdc_secretary:
      case UserRole.team_member:
        // Field team members and leaders access houses assigned to their team
        if (!scope.teamId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message_key: 'errors.scope.missing_team',
          });
        }
        return {
          ...baseCondition,
          OR: [{ teamId: scope.teamId }, { createdBy: scope.userId }],
        };

      default:
        throw new ForbiddenException({
          code: 'FORBIDDEN_SCOPE',
          message_key: 'errors.scope.unauthorized_role',
        });
    }
  }

  /**
   * Generates Prisma WHERE filter for querying clients according to scope.
   * Level 5 (team_member) is strictly restricted to own entries.
   */
  getClientScopeFilter(scope: ScopeContext): Record<string, any> {
    const baseCondition: Record<string, any> = { deletedAt: null };

    switch (scope.role) {
      case UserRole.super_admin:
        return baseCondition;

      case UserRole.admin:
      case UserRole.cg:
        if (scope.districtId) {
          return {
            ...baseCondition,
            OR: [
              { districtId: scope.districtId },
              { collectedBy: scope.userId },
            ],
          };
        }
        return baseCondition;

      case UserRole.dc:
        if (!scope.districtId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message_key: 'errors.scope.missing_district',
          });
        }
        return {
          ...baseCondition,
          OR: [{ districtId: scope.districtId }, { collectedBy: scope.userId }],
        };

      case UserRole.sda:
        if (!scope.dsId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message_key: 'errors.scope.missing_ds',
          });
        }
        return {
          ...baseCondition,
          OR: [{ dsId: scope.dsId }, { collectedBy: scope.userId }],
        };

      case UserRole.cdc_secretary:
        if (!scope.teamId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message_key: 'errors.scope.missing_team',
          });
        }
        // Level 4 sees own team's entries plus own entries (C4)
        return {
          ...baseCondition,
          OR: [{ teamId: scope.teamId }, { collectedBy: scope.userId }],
        };

      case UserRole.team_member:
        // Level 5 sees ONLY own entries (C7 / Blueprint 3.3)
        return {
          ...baseCondition,
          collectedBy: scope.userId,
        };

      default:
        throw new ForbiddenException({
          code: 'FORBIDDEN_SCOPE',
          message_key: 'errors.scope.unauthorized_role',
        });
    }
  }

  /**
   * Asserts whether a given user can edit an already-synced client record.
   * Level 5 is strictly locked out (C2). Level 4 (own team) and Level 00 can edit (C13).
   */
  canEditSyncedClient(
    scope: ScopeContext,
    client: { teamId?: string | null; collectedBy: string },
  ): boolean {
    if (scope.role === UserRole.super_admin) return true;
    if (
      scope.role === UserRole.cdc_secretary &&
      scope.teamId &&
      client.teamId === scope.teamId
    ) {
      return true;
    }
    // Level 5 can never edit synced records
    return false;
  }

  /**
   * Evaluates if caller can see a given row per Section 5.4 (app.can_see equivalent).
   */
  canSee(
    scope: ScopeContext,
    target: {
      districtId: string;
      dsId: string;
      gnId: string;
      teamId?: string;
      collectedBy: string;
    },
  ): boolean {
    if (scope.role === UserRole.super_admin) return true;
    if (scope.role === UserRole.admin || scope.role === UserRole.cg)
      return true;
    if (scope.role === UserRole.dc) {
      return (
        target.districtId === scope.districtId ||
        target.collectedBy === scope.userId
      );
    }
    if (scope.role === UserRole.sda) {
      return target.dsId === scope.dsId || target.collectedBy === scope.userId;
    }
    if (scope.role === UserRole.cdc_secretary) {
      return (
        target.teamId === scope.teamId || target.collectedBy === scope.userId
      );
    }
    if (scope.role === UserRole.team_member) {
      return target.collectedBy === scope.userId;
    }
    return false;
  }
}
