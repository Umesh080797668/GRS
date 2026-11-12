import { UserRole } from '@prisma/client';

export type ExtendedRole = UserRole | 'anon' | 'deactivated';

export interface EndpointPolicy {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  category:
  | 'auth'
  | 'accounts'
  | 'config'
  | 'lookups'
  | 'areas'
  | 'houses'
  | 'clients'
  | 'sync'
  | 'duplicates'
  | 'stats'
  | 'exports'
  | 'releases'
  | 'imports';
  allowedRoles: ExtendedRole[];
  scopeEnforcement:
  'none' | 'own_only' | 'team_only' | 'gn_only' | 'hierarchical' | 'national';
  description: string;
}

export const ROLE_ENDPOINT_POLICIES: EndpointPolicy[] = [
  // Auth Endpoints
  {
    method: 'POST',
    path: '/auth/login',
    category: 'auth',
    allowedRoles: [
      'anon',
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'none',
    description:
      'Login with ID or verified email (uniform errors, rate-limited)',
  },
  {
    method: 'POST',
    path: '/auth/change-password',
    category: 'auth',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'own_only',
    description:
      'Change password (clears must_change_password, bumps token_version)',
  },
  {
    method: 'POST',
    path: '/auth/refresh',
    category: 'auth',
    allowedRoles: [
      'anon',
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'own_only',
    description:
      'Refresh session using refresh token (rotation with reuse detection)',
  },
  {
    method: 'POST',
    path: '/auth/logout',
    category: 'auth',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'own_only',
    description: 'Revoke refresh token and session',
  },
  {
    method: 'POST',
    path: '/auth/email/add',
    category: 'auth',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'own_only',
    description: 'Add pending email and dispatch 6-digit OTP code',
  },
  {
    method: 'POST',
    path: '/auth/email/verify',
    category: 'auth',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'own_only',
    description: 'Verify 6-digit OTP code and promote pending email',
  },
  {
    method: 'POST',
    path: '/auth/forgot',
    category: 'auth',
    allowedRoles: [
      'anon',
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'none',
    description: 'Request password reset code (returns 202 uniformly)',
  },
  {
    method: 'POST',
    path: '/auth/reset',
    category: 'auth',
    allowedRoles: [
      'anon',
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'none',
    description: 'Reset password using verified 6-digit email code',
  },
  {
    method: 'PATCH',
    path: '/auth/profile',
    category: 'auth',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'own_only',
    description: 'Update user profile preferences (preferred language)',
  },
  {
    method: 'POST',
    path: '/auth/switch-area',
    category: 'auth',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'own_only',
    description:
      'Switch active GN area session for multi-GN CDC secretary (Decision C20)',
  },
  {
    method: 'GET',
    path: '/auth/assignments',
    category: 'auth',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'own_only',
    description: 'List assigned GN divisions for current user',
  },
  {
    method: 'POST',
    path: '/auth/heartbeat',
    category: 'auth',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'own_only',
    description: 'Record client keep-alive heartbeat and extend active session',
  },

  // Accounts Endpoints (Creation matrix §6.1)
  {
    method: 'POST',
    path: '/accounts',
    category: 'accounts',
    allowedRoles: ['cdc_secretary', 'sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description: 'Create single account one level down (atomic team limit)',
  },
  {
    method: 'POST',
    path: '/accounts/bulk',
    category: 'accounts',
    allowedRoles: ['cdc_secretary', 'sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description:
      'Create bulk accounts (<=100) atomic against team member limit',
  },
  {
    method: 'GET',
    path: '/accounts',
    category: 'accounts',
    allowedRoles: ['cdc_secretary', 'sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description: 'List accounts within caller scope (keyset-paged)',
  },
  {
    method: 'PATCH',
    path: '/accounts/:id',
    category: 'accounts',
    allowedRoles: ['cdc_secretary', 'sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description: 'Update profile details for subordinate account in scope',
  },
  {
    method: 'DELETE',
    path: '/accounts/:id',
    category: 'accounts',
    allowedRoles: ['cdc_secretary', 'sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description:
      'Permanently delete unused subordinate account without field/audit history',
  },
  {
    method: 'PATCH',
    path: '/accounts/:id/deactivate',
    category: 'accounts',
    allowedRoles: ['cdc_secretary', 'sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description:
      'Deactivate subordinate account (bumps token_version to invalidate tokens)',
  },
  {
    method: 'PATCH',
    path: '/accounts/:id/reactivate',
    category: 'accounts',
    allowedRoles: ['cdc_secretary', 'sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description: 'Reactivate subordinate account in scope',
  },
  {
    method: 'POST',
    path: '/accounts/:id/reset-password',
    category: 'accounts',
    allowedRoles: ['cdc_secretary', 'sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description: 'Admin reset of subordinate password (displayed once)',
  },
  {
    method: 'POST',
    path: '/accounts/:id/reissue-password',
    category: 'accounts',
    allowedRoles: ['cdc_secretary', 'sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description: 'Reissue one-time password for subordinate account',
  },
  {
    method: 'POST',
    path: '/accounts/batches/:id/reissue',
    category: 'accounts',
    allowedRoles: ['cdc_secretary', 'sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description: 'Reissue passwords for unactivated batch members',
  },
  {
    method: 'GET',
    path: '/accounts/assignments',
    category: 'accounts',
    allowedRoles: ['sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description: 'List active territorial assignments within caller scope',
  },
  {
    method: 'GET',
    path: '/accounts/:id/assignments',
    category: 'accounts',
    allowedRoles: ['sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description: 'List assignment history for a profile within caller scope',
  },
  {
    method: 'POST',
    path: '/accounts/:id/assign',
    category: 'accounts',
    allowedRoles: ['sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description: 'Assign territory to a subordinate account in scope',
  },
  {
    method: 'POST',
    path: '/accounts/:id/end-assignment',
    category: 'accounts',
    allowedRoles: ['sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description: 'End active assignment for an account in scope',
  },
  {
    method: 'POST',
    path: '/accounts/:id/transfer',
    category: 'accounts',
    allowedRoles: ['sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description: 'Transfer active assignment to another subordinate account',
  },
  {
    method: 'GET',
    path: '/accounts/activity',
    category: 'accounts',
    allowedRoles: ['super_admin'],
    scopeEnforcement: 'national',
    description:
      'Super Admin monitor of currently logged-in users, last active times, and active durations',
  },
  {
    method: 'GET',
    path: '/accounts/:id/activity',
    category: 'accounts',
    allowedRoles: ['super_admin'],
    scopeEnforcement: 'national',
    description:
      'Super Admin drill-down of session history for a single account',
  },

  // Config & Lookups
  {
    method: 'GET',
    path: '/config',
    category: 'config',
    allowedRoles: [
      'anon',
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'none',
    description: 'Fetch sync pacing, min supported versions, consent version',
  },
  {
    method: 'PATCH',
    path: '/config',
    category: 'config',
    allowedRoles: ['super_admin'],
    scopeEnforcement: 'national',
    description: 'Update system configuration settings (L00 only)',
  },
  {
    method: 'GET',
    path: '/lookups',
    category: 'lookups',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'national',
    description: 'Fetch trilingual lookup catalog (ETag cacheable)',
  },
  {
    method: 'GET',
    path: '/lookups/version',
    category: 'lookups',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'national',
    description: 'Deterministic hash and version of lookup data',
  },
  {
    method: 'POST',
    path: '/lookups/seed',
    category: 'lookups',
    allowedRoles: ['super_admin'],
    scopeEnforcement: 'national',
    description: 'Seed lookup reference datasets (L00 only)',
  },

  // Areas & Teams (L00 administration)
  {
    method: 'GET',
    path: '/areas/districts',
    category: 'areas',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'national',
    description: 'List 25 Sri Lankan districts',
  },
  {
    method: 'GET',
    path: '/areas/districts/:id',
    category: 'areas',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'national',
    description: 'Get district details by ID',
  },
  {
    method: 'POST',
    path: '/areas/districts/seed',
    category: 'areas',
    allowedRoles: ['admin', 'super_admin'],
    scopeEnforcement: 'national',
    description: 'Seed all 25 districts from static reference (L00/Admin)',
  },
  {
    method: 'GET',
    path: '/areas/ds',
    category: 'areas',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'hierarchical',
    description: 'List DS divisions in scope',
  },
  {
    method: 'POST',
    path: '/areas/ds',
    category: 'areas',
    allowedRoles: ['admin', 'super_admin'],
    scopeEnforcement: 'national',
    description: 'Create DS division (L00/Admin)',
  },
  {
    method: 'PATCH',
    path: '/areas/ds/:id',
    category: 'areas',
    allowedRoles: ['admin', 'super_admin'],
    scopeEnforcement: 'national',
    description: 'Update DS division details (L00/Admin)',
  },
  {
    method: 'DELETE',
    path: '/areas/ds/:id',
    category: 'areas',
    allowedRoles: ['admin', 'super_admin'],
    scopeEnforcement: 'national',
    description: 'Delete DS division when empty (L00/Admin)',
  },
  {
    method: 'GET',
    path: '/areas/gn',
    category: 'areas',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'hierarchical',
    description: 'List GN divisions in scope',
  },
  {
    method: 'POST',
    path: '/areas/gn',
    category: 'areas',
    allowedRoles: ['admin', 'super_admin'],
    scopeEnforcement: 'national',
    description: 'Create GN division (L00/Admin)',
  },
  {
    method: 'GET',
    path: '/areas/gn/:id',
    category: 'areas',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'hierarchical',
    description: 'Get GN division details in scope',
  },
  {
    method: 'PATCH',
    path: '/areas/gn/:id',
    category: 'areas',
    allowedRoles: ['cdc_secretary', 'sda', 'admin', 'super_admin'],
    scopeEnforcement: 'gn_only',
    description: 'Update GN division secretary details (L4 own GN, L00/Admin)',
  },
  {
    method: 'DELETE',
    path: '/areas/gn/:id',
    category: 'areas',
    allowedRoles: ['admin', 'super_admin'],
    scopeEnforcement: 'national',
    description: 'Delete GN division when empty (L00/Admin)',
  },
  {
    method: 'GET',
    path: '/areas/teams',
    category: 'areas',
    allowedRoles: ['cdc_secretary', 'sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description: 'List field teams in scope',
  },
  {
    method: 'POST',
    path: '/areas/teams',
    category: 'areas',
    allowedRoles: ['sda', 'admin', 'super_admin'],
    scopeEnforcement: 'national',
    description: 'Create team with member limit (L00/Admin)',
  },
  {
    method: 'PATCH',
    path: '/areas/teams/:id',
    category: 'areas',
    allowedRoles: ['sda', 'admin', 'super_admin'],
    scopeEnforcement: 'national',
    description: 'Update team details or member limits (L00/Admin)',
  },
  {
    method: 'DELETE',
    path: '/areas/teams/:id',
    category: 'areas',
    allowedRoles: ['sda', 'admin', 'super_admin'],
    scopeEnforcement: 'national',
    description: 'Delete empty field team (L00/Admin)',
  },
  {
    method: 'POST',
    path: '/areas/import-csv',
    category: 'areas',
    allowedRoles: ['admin', 'super_admin'],
    scopeEnforcement: 'national',
    description: 'Import pilot area CSV fixture (L00/Admin)',
  },

  // Households
  {
    method: 'GET',
    path: '/houses',
    category: 'houses',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'hierarchical',
    description: 'List households within caller area scope',
  },
  {
    method: 'GET',
    path: '/houses/:id',
    category: 'houses',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'hierarchical',
    description: 'Get household details by ID in scope',
  },
  {
    method: 'POST',
    path: '/houses',
    category: 'houses',
    allowedRoles: ['cdc_secretary', 'super_admin'],
    scopeEnforcement: 'gn_only',
    description: 'Create household in own GN division (allocates serial)',
  },
  {
    method: 'PATCH',
    path: '/houses/:id',
    category: 'houses',
    allowedRoles: ['cdc_secretary', 'super_admin'],
    scopeEnforcement: 'gn_only',
    description: 'Correct household pre-visit data in own GN (audited)',
  },
  {
    method: 'DELETE',
    path: '/houses/:id',
    category: 'houses',
    allowedRoles: ['cdc_secretary', 'super_admin'],
    scopeEnforcement: 'gn_only',
    description: 'Soft delete household (only if no clients attached)',
  },
  {
    method: 'POST',
    path: '/houses/:id/finish',
    category: 'houses',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'team_only',
    description: 'Mark household visit status as finished/completed',
  },
  {
    method: 'POST',
    path: '/houses/:id/reopen',
    category: 'houses',
    allowedRoles: ['cdc_secretary', 'sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'team_only',
    description: 'Reopen completed household visit (team leader and above)',
  },
  {
    method: 'POST',
    path: '/teams/:id/houses',
    category: 'houses',
    allowedRoles: ['cdc_secretary', 'super_admin'],
    scopeEnforcement: 'team_only',
    description: 'Assign batch of houses to team (atomic, one team per house)',
  },
  {
    method: 'DELETE',
    path: '/teams/:id/houses/:houseId',
    category: 'houses',
    allowedRoles: ['cdc_secretary', 'super_admin'],
    scopeEnforcement: 'team_only',
    description: 'Unassign house from team',
  },
  {
    method: 'POST',
    path: '/teams/:id/houses/:houseId/reassign',
    category: 'houses',
    allowedRoles: ['super_admin'],
    scopeEnforcement: 'team_only',
    description: 'Reassign house with clients to team (Build Plan §8.4)',
  },

  // Clients & Data Entry
  {
    method: 'GET',
    path: '/clients',
    category: 'clients',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'hierarchical',
    description:
      'Keyset-paged clients within caller scope (L5: own; L4: team; L00: all)',
  },
  {
    method: 'POST',
    path: '/clients',
    category: 'clients',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'team_only',
    description: 'Online direct client data entry (same validation as sync)',
  },
  {
    method: 'PATCH',
    path: '/clients/:id',
    category: 'clients',
    allowedRoles: ['cdc_secretary', 'super_admin'],
    scopeEnforcement: 'team_only',
    description:
      'Correction of client fields (writes client_audit row, L5 locked)',
  },
  {
    method: 'DELETE',
    path: '/clients/:id',
    category: 'clients',
    allowedRoles: ['cdc_secretary', 'super_admin'],
    scopeEnforcement: 'team_only',
    description:
      'Soft-delete client record (writes client_audit row, L5 locked)',
  },

  // Sync Engine (M3)
  {
    method: 'GET',
    path: '/sync/area',
    category: 'sync',
    allowedRoles: ['team_member', 'cdc_secretary'],
    scopeEnforcement: 'hierarchical',
    description:
      'Download initial area data (paged, resumable, houses + own clients)',
  },
  {
    method: 'GET',
    path: '/sync/changes',
    category: 'sync',
    allowedRoles: ['team_member', 'cdc_secretary'],
    scopeEnforcement: 'hierarchical',
    description:
      'Incremental sync delta since cursor (called on open and sync now)',
  },
  {
    method: 'POST',
    path: '/sync/push',
    category: 'sync',
    allowedRoles: ['team_member', 'cdc_secretary'],
    scopeEnforcement: 'hierarchical',
    description:
      'Bulk upsert client records (per-record results, revision guard)',
  },

  // Duplicates & Auditing
  {
    method: 'GET',
    path: '/duplicates',
    category: 'duplicates',
    allowedRoles: ['cdc_secretary', 'sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description: 'List duplicate candidate pairs within scope',
  },
  {
    method: 'POST',
    path: '/duplicates/:id/confirm',
    category: 'duplicates',
    allowedRoles: ['cdc_secretary', 'super_admin'],
    scopeEnforcement: 'team_only',
    description: 'Confirm duplicate candidate pair',
  },
  {
    method: 'POST',
    path: '/duplicates/:id/dismiss',
    category: 'duplicates',
    allowedRoles: ['cdc_secretary', 'super_admin'],
    scopeEnforcement: 'team_only',
    description: 'Dismiss duplicate candidate pair',
  },

  // Summary Stats & Dashboard
  {
    method: 'GET',
    path: '/stats/progress',
    category: 'stats',
    allowedRoles: [
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'hierarchical',
    description:
      'Read progress counts from team_stats / area_stats with refreshed_at',
  },

  // Long Exports & Reports (M7)
  {
    method: 'POST',
    path: '/exports',
    category: 'exports',
    allowedRoles: ['cdc_secretary', 'sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description:
      'Queue or run inline Excel/CSV report export job R1-R5 (Level 5 forbidden; R5 duplicates L4/L00 only)',
  },
  {
    method: 'GET',
    path: '/exports/preview',
    category: 'exports',
    allowedRoles: ['cdc_secretary', 'sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description:
      'Fetch scoped report summary payload (R1/R3/R4/R5) for dashboard @media print PDF reports',
  },
  {
    method: 'GET',
    path: '/exports',
    category: 'exports',
    allowedRoles: ['cdc_secretary', 'sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description:
      'Keyset-paginated list of caller export jobs with fresh signed download URLs (Level 5 forbidden)',
  },
  {
    method: 'GET',
    path: '/exports/:id',
    category: 'exports',
    allowedRoles: ['cdc_secretary', 'sda', 'dc', 'cg', 'admin', 'super_admin'],
    scopeEnforcement: 'hierarchical',
    description:
      'Check export job status and fetch temporary signed storage URL',
  },

  // App Releases
  {
    method: 'GET',
    path: '/releases/latest',
    category: 'releases',
    allowedRoles: [
      'anon',
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'none',
    description: 'Public release info (version, checksum, APK download URL)',
  },
  {
    method: 'GET',
    path: '/releases/manifest',
    category: 'releases',
    allowedRoles: [
      'anon',
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'none',
    description: 'Public release manifest JSON',
  },
  {
    method: 'GET',
    path: '/releases/download',
    category: 'releases',
    allowedRoles: [
      'anon',
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'none',
    description: 'Download release APK binary',
  },
  {
    method: 'GET',
    path: '/releases/check',
    category: 'releases',
    allowedRoles: [
      'anon',
      'team_member',
      'cdc_secretary',
      'sda',
      'dc',
      'cg',
      'admin',
      'super_admin',
    ],
    scopeEnforcement: 'none',
    description: 'Check update status against latest release',
  },
  {
    method: 'POST',
    path: '/releases/sync',
    category: 'releases',
    allowedRoles: ['super_admin'],
    scopeEnforcement: 'national',
    description: 'Trigger GitHub releases sync (CI or super_admin)',
  },
  {
    method: 'POST',
    path: '/releases',
    category: 'releases',
    allowedRoles: ['super_admin'],
    scopeEnforcement: 'national',
    description: 'Publish new application release metadata (L00 only)',
  },
  // Import Endpoints (Preview / Confirm Workflow & Staging)
  {
    method: 'POST',
    path: '/imports/preview',
    category: 'imports',
    allowedRoles: ['cdc_secretary', 'admin', 'super_admin'],
    scopeEnforcement: 'gn_only',
    description:
      'Preview household spreadsheet/CSV import and store in staging table',
  },
  {
    method: 'POST',
    path: '/imports/:id/confirm',
    category: 'imports',
    allowedRoles: ['cdc_secretary', 'admin', 'super_admin'],
    scopeEnforcement: 'gn_only',
    description:
      'Confirm and commit valid staging rows into households table in atomic transaction',
  },
  {
    method: 'GET',
    path: '/imports/template',
    category: 'imports',
    allowedRoles: ['cdc_secretary', 'admin', 'super_admin'],
    scopeEnforcement: 'none',
    description: 'Download official CSV template with trilingual comments',
  },
  {
    method: 'GET',
    path: '/imports/:id',
    category: 'imports',
    allowedRoles: ['cdc_secretary', 'admin', 'super_admin'],
    scopeEnforcement: 'gn_only',
    description: 'Retrieve import batch details and staging rows',
  },
  {
    method: 'GET',
    path: '/imports/:id/errors',
    category: 'imports',
    allowedRoles: ['cdc_secretary', 'admin', 'super_admin'],
    scopeEnforcement: 'gn_only',
    description:
      'Download sanitized error report CSV for invalid rows in batch',
  },
];

export class RoleMatrixEvaluator {
  /**
   * Asserts whether a role is authorized for an endpoint and whether scope matches.
   */
  static isAuthorized(
    role: ExtendedRole,
    method: string,
    path: string,
    options?: {
      targetScope?: {
        districtId?: string;
        dsId?: string;
        gnId?: string;
        teamId?: string;
        ownerId?: string;
      };
      callerScope?: {
        userId?: string;
        districtId?: string;
        dsId?: string;
        gnId?: string;
        teamId?: string;
      };
    },
  ): { allowed: boolean; reason?: string } {
    if (role === 'deactivated') {
      return { allowed: false, reason: 'account_deactivated_401' };
    }

    const policy = ROLE_ENDPOINT_POLICIES.find(
      (p) => p.method === method && p.path === path,
    );

    if (!policy) {
      return { allowed: false, reason: 'unknown_endpoint' };
    }

    const roleAllowed = policy.allowedRoles.includes(role);
    if (!roleAllowed) {
      return {
        allowed: false,
        reason: role === 'anon' ? 'unauthorized_401' : 'forbidden_403',
      };
    }

    // Check scope isolation if target and caller scopes are supplied
    if (
      options?.callerScope &&
      options?.targetScope &&
      role !== 'super_admin'
    ) {
      const { callerScope, targetScope } = options;

      // Level 5 (team_member): strictly own collected records or own team
      if (role === UserRole.team_member) {
        if (
          policy.scopeEnforcement === 'own_only' &&
          targetScope.ownerId &&
          targetScope.ownerId !== callerScope.userId
        ) {
          return { allowed: false, reason: 'cross_agent_forbidden_403' };
        }
        if (targetScope.teamId && targetScope.teamId !== callerScope.teamId) {
          return { allowed: false, reason: 'cross_team_forbidden_403' };
        }
      }

      // Level 4 (cdc_secretary): own team for push/team_only, or own GN for gn_only
      if (role === UserRole.cdc_secretary) {
        if (
          (policy.scopeEnforcement === 'team_only' ||
            policy.path === '/sync/push') &&
          targetScope.teamId &&
          targetScope.teamId !== callerScope.teamId
        ) {
          return { allowed: false, reason: 'cross_team_forbidden_403' };
        }
        if (
          policy.scopeEnforcement === 'gn_only' &&
          targetScope.gnId &&
          targetScope.gnId !== callerScope.gnId
        ) {
          return { allowed: false, reason: 'cross_gn_forbidden_403' };
        }
      }

      // Level 3 (sda): own DS
      if (
        role === UserRole.sda &&
        targetScope.dsId &&
        targetScope.dsId !== callerScope.dsId
      ) {
        return { allowed: false, reason: 'cross_ds_forbidden_403' };
      }

      // Level 2 (dc): own District
      if (
        role === UserRole.dc &&
        targetScope.districtId &&
        targetScope.districtId !== callerScope.districtId
      ) {
        return { allowed: false, reason: 'cross_district_forbidden_403' };
      }
    }

    return { allowed: true };
  }

  /**
   * Generates a markdown matrix table for documentation and audit.
   */
  static generateMarkdownMatrix(): string {
    const allRoles: ExtendedRole[] = [
      'anon',
      'deactivated',
      UserRole.team_member,
      UserRole.cdc_secretary,
      UserRole.sda,
      UserRole.dc,
      UserRole.cg,
      UserRole.admin,
      UserRole.super_admin,
    ];

    let md = '# GRS Role × Endpoint Authorization Matrix\n\n';
    md +=
      '| Endpoint | Method | anon | deactivated | team_member (L5) | cdc_secretary (L4) | sda (L3) | dc (L2) | cg (L1) | admin (L0) | super_admin (L00) | Scope Rule |\n';
    md +=
      '| --- | --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | --- |\n';

    for (const policy of ROLE_ENDPOINT_POLICIES) {
      const row = [
        `\`${policy.path}\``,
        `**${policy.method}**`,
        ...allRoles.map((r) => {
          if (r === 'deactivated') return '❌ 401';
          return policy.allowedRoles.includes(r)
            ? '✅ Allow'
            : r === 'anon'
              ? '❌ 401'
              : '❌ 403';
        }),
        `\`${policy.scopeEnforcement}\``,
      ];
      md += `| ${row.join(' | ')} |\n`;
    }

    return md;
  }
}
