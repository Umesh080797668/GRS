import { UserRole } from '@prisma/client';

export { UserRole };

/**
 * ScopeContext represents the authenticated user's authorization and territorial boundary.
 * Enforced on every database access per Invariant 4.
 */
export interface ScopeContext {
  userId: string;
  role: UserRole;
  districtId?: string | null;
  dsId?: string | null;
  gnId?: string | null;
  teamId?: string | null;
  scope?: string | null;
}

/**
 * Numeric role rank hierarchy per Section 3 and Section 5.1.
 * Higher rank numbers indicate higher administrative authority.
 */
export function getRoleRank(role: UserRole): number {
  switch (role) {
    case UserRole.super_admin:
      return 100; // Level 00
    case UserRole.admin:
      return 90; // Level 0
    case UserRole.cg:
      return 80; // Level 1 (Admin CG)
    case UserRole.dc:
      return 70; // Level 2 (Admin DC)
    case UserRole.sda:
      return 60; // Level 3 (Admin SDA)
    case UserRole.cdc_secretary:
      return 50; // Level 4 (CDC Secretary / Team Leader)
    case UserRole.team_member:
      return 40; // Level 5 (CDC Team Member)
    default:
      return 0;
  }
}

/**
 * Matrix of who can create accounts for whom per Build Plan §6.1.
 */
export const CREATION_MATRIX: Record<UserRole, UserRole[]> = {
  [UserRole.super_admin]: [
    UserRole.admin,
    UserRole.cg,
    UserRole.dc,
    UserRole.sda,
    UserRole.cdc_secretary,
    UserRole.team_member,
  ],
  [UserRole.admin]: [], // Level 0 role to be decided (C17)
  [UserRole.cg]: [UserRole.dc, UserRole.team_member], // Level 1 (M13)
  [UserRole.dc]: [UserRole.sda, UserRole.team_member], // Level 2 (M13)
  [UserRole.sda]: [UserRole.cdc_secretary, UserRole.team_member], // Level 3 (M13)
  [UserRole.cdc_secretary]: [UserRole.team_member], // Level 4 creates own team members only
  [UserRole.team_member]: [], // Level 5 creates no accounts
};

/**
 * Evaluates whether creator role can create an account with target role.
 */
export function canCreateRole(
  creatorRole: UserRole,
  targetRole: UserRole,
): boolean {
  const allowed = CREATION_MATRIX[creatorRole] || [];
  return allowed.includes(targetRole);
}
