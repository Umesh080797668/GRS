import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, ScopeContext, getRoleRank } from '../common/scope/scope.types';
import { AssignAccountDto } from './dto/assign-account.dto';
import { TransferAccountDto } from './dto/transfer-account.dto';
import { ListAssignmentsDto } from './dto/list-assignments.dto';

type Territory = {
  districtId?: string | null;
  dsId?: string | null;
  gnId?: string | null;
  teamId?: string | null;
};

@Injectable()
export class AssignmentService {
  constructor(private readonly prisma: PrismaService) { }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Assigns territory to a profile.
   * Ends any currently open assignment first (one-active-per-person rule).
   * Bumps tokenVersion so stale access tokens pick up the change on next refresh.
   */
  async assign(
    actor: ScopeContext,
    profileId: string,
    dto: AssignAccountDto,
  ) {
    const territory = this.extractTerritory(dto);

    // Fast role-level gate: cdc_secretary / team_member can never assign.
    // We call with the raw (unresolved) territory so no DB round-trip is needed
    // before rejecting unpermitted roles.
    this.assertCanAssignRole(actor);

    const target = await this.requireActiveProfile(profileId);

    // Resolve the full territory chain from the specified leaf so that
    // assertCanAssign has the full districtId/dsId populated for containment.
    const resolved = await this.resolveTerritory(territory);
    await this.assertCanAssign(actor, resolved);

    return this.prisma.$transaction(
      async (tx) => {
        // End any currently open assignment for this profile
        await this.endOpenAssignment(tx, profileId, actor.userId);

        // Create new assignment
        const assignment = await (tx as any).accountAssignment.create({
          data: {
            profileId,
            districtId: resolved.districtId ?? null,
            dsId: resolved.dsId ?? null,
            gnId: resolved.gnId ?? null,
            teamId: resolved.teamId ?? null,
            assignedBy: actor.userId,
            note: dto.note ?? null,
            validFrom: new Date(),
          },
        });

        // Update profile cache columns + bump tokenVersion
        await tx.profile.update({
          where: { id: profileId },
          data: {
            districtId: resolved.districtId ?? null,
            dsId: resolved.dsId ?? null,
            gnId: resolved.gnId ?? null,
            teamId: resolved.teamId ?? null,
            tokenVersion: { increment: 1 },
          },
        });

        // If assigning to a GN, keep profile_assignments in sync (compat shim)
        if (resolved.gnId) {
          await this.syncProfileAssignment(tx, profileId, resolved, actor.userId);

          // Keep teams.leader_id in sync for cdc_secretary
          if (resolved.teamId && target.role === UserRole.cdc_secretary) {
            await tx.team.update({
              where: { id: resolved.teamId },
              data: { leaderId: profileId },
            });
          }
        }

        await tx.accountAudit.create({
          data: {
            actorId: actor.userId,
            targetId: profileId,
            action: 'assigned',
          },
        });

        return assignment;
      },
      { maxWait: 15000, timeout: 15000 },
    );
  }

  /**
   * Ends the open assignment for a profile.
   * Clears cache columns and bumps tokenVersion (fail-closed: next request sees empty scope).
   */
  async endAssignment(actor: ScopeContext, profileId: string) {
    const target = await this.requireActiveProfile(profileId);
    this.assertCanManage(actor, target);

    return this.prisma.$transaction(
      async (tx) => {
        const ended = await this.endOpenAssignment(tx, profileId, actor.userId);
        if (!ended) {
          throw new NotFoundException({
            code: 'NO_ACTIVE_ASSIGNMENT',
            message: 'Profile has no active assignment to end',
          });
        }

        // Clear profile cache columns → fail-closed
        await tx.profile.update({
          where: { id: profileId },
          data: {
            districtId: null,
            dsId: null,
            gnId: null,
            teamId: null,
            tokenVersion: { increment: 1 },
          },
        });

        // Revoke refresh tokens so the next session starts clean
        await tx.refreshToken.updateMany({
          where: { profileId, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        await tx.accountAudit.create({
          data: {
            actorId: actor.userId,
            targetId: profileId,
            action: 'assignment_ended',
          },
        });

        return ended;
      },
      { maxWait: 15000, timeout: 15000 },
    );
  }

  /**
   * Transfers the current open assignment (or a specified territory) from one profile to another.
   * Atomically ends the from-profile's assignment and creates one for the to-profile.
   */
  async transfer(
    actor: ScopeContext,
    fromProfileId: string,
    dto: TransferAccountDto,
  ) {
    const { toProfileId } = dto;
    if (fromProfileId === toProfileId) {
      throw new BadRequestException({
        code: 'TRANSFER_SAME_PROFILE',
        message: 'Cannot transfer assignment to the same profile',
      });
    }

    const [fromProfile, toProfile] = await Promise.all([
      this.requireActiveProfile(fromProfileId),
      this.requireActiveProfile(toProfileId),
    ]);

    this.assertCanManage(actor, fromProfile);
    this.assertCanManage(actor, toProfile);

    return this.prisma.$transaction(
      async (tx) => {
        // Find from-profile's current open assignment
        const existing = await (tx as any).accountAssignment.findFirst({
          where: { profileId: fromProfileId, validTo: null },
        });

        // Territory: use dto if provided, else copy from existing
        const rawTerritory: Territory = {
          districtId: dto.districtId ?? existing?.districtId,
          dsId: dto.dsId ?? existing?.dsId,
          gnId: dto.gnId ?? existing?.gnId,
          teamId: dto.teamId ?? existing?.teamId,
        };

        const resolved = await this.resolveTerritory(rawTerritory);

        await this.assertCanAssign(actor, resolved);

        // End from-profile's assignment
        if (existing) {
          await (tx as any).accountAssignment.update({
            where: { id: existing.id },
            data: { validTo: new Date(), endedBy: actor.userId },
          });
        }

        // Clear from-profile cache
        await tx.profile.update({
          where: { id: fromProfileId },
          data: {
            districtId: null,
            dsId: null,
            gnId: null,
            teamId: null,
            tokenVersion: { increment: 1 },
          },
        });
        await tx.refreshToken.updateMany({
          where: { profileId: fromProfileId, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        // End any existing assignment on to-profile
        await this.endOpenAssignment(tx, toProfileId, actor.userId);

        // Create new assignment on to-profile
        const newAssignment = await (tx as any).accountAssignment.create({
          data: {
            profileId: toProfileId,
            districtId: resolved.districtId ?? null,
            dsId: resolved.dsId ?? null,
            gnId: resolved.gnId ?? null,
            teamId: resolved.teamId ?? null,
            assignedBy: actor.userId,
            note: dto.note ?? null,
            validFrom: new Date(),
          },
        });

        // Update to-profile cache
        await tx.profile.update({
          where: { id: toProfileId },
          data: {
            districtId: resolved.districtId ?? null,
            dsId: resolved.dsId ?? null,
            gnId: resolved.gnId ?? null,
            teamId: resolved.teamId ?? null,
            tokenVersion: { increment: 1 },
          },
        });

        // Keep profile_assignments in sync for GN assignments
        if (resolved.gnId) {
          await this.syncProfileAssignment(tx, toProfileId, resolved, actor.userId);
          if (resolved.teamId && toProfile.role === UserRole.cdc_secretary) {
            await tx.team.update({
              where: { id: resolved.teamId },
              data: { leaderId: toProfileId },
            });
          }
        }

        await tx.accountAudit.createMany({
          data: [
            { actorId: actor.userId, targetId: fromProfileId, action: 'assignment_transferred_from' },
            { actorId: actor.userId, targetId: toProfileId, action: 'assignment_transferred_to' },
          ],
        });

        return newAssignment;
      },
      { maxWait: 15000, timeout: 15000 },
    );
  }

  /**
   * Lists active assignments within the caller's scope.
   */
  async listActive(actor: ScopeContext, filters: ListAssignmentsDto) {
    const where: any = {};

    if (filters.status !== 'all') {
      where.validTo = null;
    }

    // Apply scope containment
    switch (actor.role) {
      case UserRole.super_admin:
      case UserRole.admin:
      case UserRole.cg:
        break; // national — no filter
      case UserRole.dc:
        if (!actor.districtId) throw new ForbiddenException({ code: 'FORBIDDEN_SCOPE', message_key: 'errors.scope.missing_district' });
        where.OR = [
          { districtId: actor.districtId },
          { profile: { districtId: actor.districtId } },
        ];
        break;
      case UserRole.sda:
        if (!actor.dsId) throw new ForbiddenException({ code: 'FORBIDDEN_SCOPE', message_key: 'errors.scope.missing_ds' });
        where.OR = [
          { dsId: actor.dsId },
          { profile: { dsId: actor.dsId } },
        ];
        break;
      default:
        throw new ForbiddenException({ code: 'FORBIDDEN_SCOPE', message_key: 'errors.scope.unauthorized_role' });
    }

    // Optional caller-supplied filters (AND'd — cannot widen scope)
    if (filters.profileId) where.profileId = filters.profileId;
    if (filters.gnId) where.gnId = filters.gnId;
    if (filters.dsId) where.dsId = filters.dsId;
    if (filters.districtId) where.districtId = filters.districtId;

    const rows = await (this.prisma as any).accountAssignment.findMany({
      where,
      include: {
        profile: { select: { id: true, userCode: true, fullName: true, role: true } },
        district: { select: { id: true, nameEn: true } },
        ds: { select: { id: true, nameEn: true } },
        gn: { select: { id: true, gnName: true, gnNumber: true } },
        team: { select: { id: true, teamNo: true } },
        assignedByProfile: { select: { id: true, userCode: true, fullName: true } },
      },
      orderBy: { validFrom: 'desc' },
      take: 200,
    });

    return { items: rows, total: rows.length };
  }

  /**
   * Returns the full assignment history for a single profile.
   */
  async getForProfile(actor: ScopeContext, profileId: string) {
    const target = await this.requireActiveProfile(profileId);
    this.assertCanManage(actor, target);

    const rows = await (this.prisma as any).accountAssignment.findMany({
      where: { profileId },
      include: {
        district: { select: { id: true, nameEn: true } },
        ds: { select: { id: true, nameEn: true } },
        gn: { select: { id: true, gnName: true, gnNumber: true } },
        team: { select: { id: true, teamNo: true } },
        assignedByProfile: { select: { id: true, userCode: true, fullName: true } },
        endedByProfile: { select: { id: true, userCode: true, fullName: true } },
      },
      orderBy: { validFrom: 'desc' },
    });

    return { profileId, items: rows };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Fast role-only gate — rejects roles that can never assign, before any DB call.
   */
  private assertCanAssignRole(actor: ScopeContext) {
    switch (actor.role) {
      case UserRole.super_admin:
      case UserRole.admin:
      case UserRole.cg:
      case UserRole.dc:
      case UserRole.sda:
        return;
      default:
        throw new ForbiddenException({
          code: 'CANNOT_ASSIGN',
          message: `Role ${actor.role} is not permitted to assign territory`,
        });
    }
  }

  /**
   * Scope containment check for assigning.
   * DC → district only, SDA → DS only, super_admin/admin/cg → anywhere.
   * cdc_secretary and team_member cannot assign.
   */
  private assertCanAssign(actor: ScopeContext, territory: Territory) {
    const forbidden = () =>
      new ForbiddenException({
        code: 'CANNOT_ASSIGN',
        message: `Role ${actor.role} is not permitted to assign territory`,
      });

    switch (actor.role) {
      case UserRole.super_admin:
      case UserRole.admin:
      case UserRole.cg:
        return; // national — no containment limit

      case UserRole.dc:
        if (!actor.districtId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message: 'DC must have an assigned district to assign territory',
          });
        }
        // All territory paths must resolve to actor's district
        if (territory.districtId && territory.districtId !== actor.districtId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DISTRICT',
            message: 'DC cannot assign territory outside their district',
          });
        }
        return;

      case UserRole.sda:
        if (!actor.dsId || !actor.districtId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message: 'SDA must have an assigned DS division to assign territory',
          });
        }
        if (territory.districtId && territory.districtId !== actor.districtId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DISTRICT',
            message: 'SDA cannot assign territory outside their district',
          });
        }
        if (territory.dsId && territory.dsId !== actor.dsId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DS',
            message: 'SDA cannot assign territory outside their DS division',
          });
        }
        return;

      case UserRole.cdc_secretary:
      case UserRole.team_member:
      default:
        throw forbidden();
    }
  }

  /**
   * Checks that the actor has sufficient rank to manage the target's assignments.
   */
  private assertCanManage(actor: ScopeContext, target: { role: UserRole }) {
    if (actor.role === UserRole.super_admin || actor.role === UserRole.admin || actor.role === UserRole.cg) return;
    if (getRoleRank(actor.role) <= getRoleRank(target.role)) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_RANK',
        message: 'Cannot manage assignments for accounts at or above your own role rank',
      });
    }
  }

  /**
   * Extracts the territory object from a DTO, validates exactly one field is set.
   */
  private extractTerritory(dto: { districtId?: string; dsId?: string; gnId?: string; teamId?: string }): Territory {
    const fields = [dto.districtId, dto.dsId, dto.gnId, dto.teamId].filter(Boolean);
    if (fields.length === 0) {
      throw new BadRequestException({
        code: 'TERRITORY_REQUIRED',
        message: 'Exactly one territory field (districtId, dsId, gnId, or teamId) must be provided',
      });
    }
    if (fields.length > 1) {
      throw new BadRequestException({
        code: 'MULTIPLE_TERRITORIES',
        message: 'Only one territory field may be specified per assignment',
      });
    }
    return {
      districtId: dto.districtId ?? null,
      dsId: dto.dsId ?? null,
      gnId: dto.gnId ?? null,
      teamId: dto.teamId ?? null,
    };
  }

  /**
   * Resolves the full territory chain from a leaf node.
   * e.g. gnId → also derives dsId and districtId.
   */
  private async resolveTerritory(territory: Territory): Promise<Territory> {
    if (territory.gnId) {
      const gn = await this.prisma.gnDivision.findUnique({
        where: { id: territory.gnId },
        include: { ds: true },
      });
      if (!gn) throw new NotFoundException({ code: 'GN_NOT_FOUND', message: 'GN division not found' });
      return {
        gnId: gn.id,
        dsId: gn.dsId,
        districtId: gn.ds.districtId,
        teamId: territory.teamId ?? null,
      };
    }
    if (territory.teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: territory.teamId },
        include: { gn: { include: { ds: true } } },
      });
      if (!team) throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: 'Team not found' });
      return {
        gnId: team.gnId,
        dsId: team.gn.dsId,
        districtId: team.gn.ds.districtId,
        teamId: team.id,
      };
    }
    if (territory.dsId) {
      const ds = await this.prisma.divisionalSecretariat.findUnique({ where: { id: territory.dsId } });
      if (!ds) throw new NotFoundException({ code: 'DS_NOT_FOUND', message: 'DS division not found' });
      return { dsId: ds.id, districtId: ds.districtId, gnId: null, teamId: null };
    }
    if (territory.districtId) {
      const district = await this.prisma.district.findUnique({ where: { id: territory.districtId } });
      if (!district) throw new NotFoundException({ code: 'DISTRICT_NOT_FOUND', message: 'District not found' });
      return { districtId: district.id, dsId: null, gnId: null, teamId: null };
    }
    throw new BadRequestException({ code: 'TERRITORY_REQUIRED', message: 'No territory specified' });
  }

  /**
   * Ends the currently open assignment for a profile (sets valid_to = now).
   * Returns the ended row, or null if no open assignment existed.
   */
  private async endOpenAssignment(tx: any, profileId: string, endedBy: string) {
    const existing = await tx.accountAssignment.findFirst({
      where: { profileId, validTo: null },
    });
    if (!existing) return null;
    return tx.accountAssignment.update({
      where: { id: existing.id },
      data: { validTo: new Date(), endedBy },
    });
  }

  /**
   * Keeps profile_assignments in sync for CDC Secretary GN assignments.
   * This is a compatibility shim while the old table still exists.
   */
  private async syncProfileAssignment(
    tx: any,
    profileId: string,
    resolved: Territory,
    _actorId: string,
  ) {
    if (!resolved.gnId) return;
    // End existing open profile_assignment for this profile
    const existing = await tx.profileAssignment.findFirst({
      where: { profileId, validTo: null },
    });
    if (existing) {
      await tx.profileAssignment.update({
        where: { id: existing.id },
        data: { validTo: new Date() },
      });
    }
    // Create new one
    await tx.profileAssignment.create({
      data: {
        profileId,
        gnId: resolved.gnId,
        teamId: resolved.teamId ?? null,
        validFrom: new Date(),
      },
    });
  }

  private async requireActiveProfile(profileId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { id: profileId } });
    if (!profile || !profile.isActive) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Profile not found or not active',
      });
    }
    return profile;
  }
}
