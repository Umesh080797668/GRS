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
import { EndAssignmentDto } from './dto/end-assignment.dto';
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
   * For CDC Secretaries assigned to a GN division, multiple active GN assignments
   * are permitted concurrently (Decision C23), while handing over that specific GN
   * if another CDC Secretary currently holds it. All other roles keep one active
   * assignment per person.
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
    this.assertCanManage(actor, target);

    // Resolve the full territory chain from the specified leaf so that
    // assertCanAssign has the full districtId/dsId populated for containment.
    const resolved = await this.resolveTerritory(territory);
    await this.assertCanAssign(actor, resolved);

    return this.prisma.$transaction(
      async (tx) => {
        const assignment = await this.grantAssignment(
          tx,
          actor,
          target,
          resolved,
          dto.note,
        );

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
   * Ends an open assignment for a profile.
   * When assignmentId is specified (e.g., for a multi-GN CDC Secretary), only
   * that assignment is closed and the profile cache switches to any remaining
   * active assignment; if none remain, profile cache clears fail-closed.
   */
  async endAssignment(
    actor: ScopeContext,
    profileId: string,
    dto?: EndAssignmentDto,
  ) {
    const target = await this.requireActiveProfile(profileId);
    this.assertCanManage(actor, target);

    return this.prisma.$transaction(
      async (tx) => {
        const existing = dto?.assignmentId
          ? await (tx as any).accountAssignment.findFirst({
              where: { id: dto.assignmentId, profileId, validTo: null },
            })
          : await (tx as any).accountAssignment.findFirst({
              where: { profileId, validTo: null },
              orderBy: { validFrom: 'desc' },
            });

        if (!existing) {
          throw new NotFoundException({
            code: 'NO_ACTIVE_ASSIGNMENT',
            message: 'Profile has no active assignment to end',
          });
        }

        if (actor.role === UserRole.dc || actor.role === UserRole.sda) {
          this.assertCanAssign(actor, {
            districtId: existing.districtId ?? null,
            dsId: existing.dsId ?? null,
            gnId: existing.gnId ?? null,
            teamId: existing.teamId ?? null,
          });
        }

        const now = new Date();
        const ended = await (tx as any).accountAssignment.update({
          where: { id: existing.id },
          data: { validTo: now, endedBy: actor.userId },
        });

        if (target.role === UserRole.cdc_secretary && existing.gnId) {
          await this.closeOpenProfileAssignments(
            tx,
            { profileId, gnId: existing.gnId },
            now,
          );
        }
        if (
          target.role === UserRole.cdc_secretary &&
          existing.teamId &&
          (tx as any).team &&
          typeof (tx as any).team.updateMany === 'function'
        ) {
          await (tx as any).team.updateMany({
            where: { id: existing.teamId, leaderId: profileId },
            data: { leaderId: null },
          });
        }

        await this.syncProfileCacheAfterRemoval(
          tx,
          profileId,
          [existing.id],
          existing.gnId ?? null,
        );

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
   * Transfers an open assignment (by assignmentId or latest open assignment)
   * from one profile to another.
   * For multi-GN CDC Secretaries, only the targeted assignment is closed on
   * fromProfileId while keeping their remaining GNs active, and assigning the
   * territory to toProfileId preserves toProfileId's other active GNs if they
   * are also a CDC Secretary.
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
        const existing = dto.assignmentId
          ? await (tx as any).accountAssignment.findFirst({
              where: {
                id: dto.assignmentId,
                profileId: fromProfileId,
                validTo: null,
              },
            })
          : await (tx as any).accountAssignment.findFirst({
              where: { profileId: fromProfileId, validTo: null },
              orderBy: { validFrom: 'desc' },
            });

        if (dto.assignmentId && !existing) {
          throw new NotFoundException({
            code: 'NO_ACTIVE_ASSIGNMENT',
            message: 'Specified active assignment was not found for source profile',
          });
        }

        if (existing && (actor.role === UserRole.dc || actor.role === UserRole.sda)) {
          this.assertCanAssign(actor, {
            districtId: existing.districtId ?? null,
            dsId: existing.dsId ?? null,
            gnId: existing.gnId ?? null,
            teamId: existing.teamId ?? null,
          });
        }

        // Territory: use dto if provided, else copy from existing
        const rawTerritory: Territory = {
          districtId: dto.districtId ?? existing?.districtId,
          dsId: dto.dsId ?? existing?.dsId,
          gnId: dto.gnId ?? existing?.gnId,
          teamId: dto.teamId ?? existing?.teamId,
        };

        const resolved = await this.resolveTerritory(rawTerritory);

        await this.assertCanAssign(actor, resolved);

        const now = new Date();
        if (existing) {
          await (tx as any).accountAssignment.update({
            where: { id: existing.id },
            data: { validTo: now, endedBy: actor.userId },
          });

          if (fromProfile.role === UserRole.cdc_secretary && existing.gnId) {
            await this.closeOpenProfileAssignments(
              tx,
              { profileId: fromProfileId, gnId: existing.gnId },
              now,
            );
          }
          if (
            fromProfile.role === UserRole.cdc_secretary &&
            existing.teamId &&
            (tx as any).team &&
            typeof (tx as any).team.updateMany === 'function'
          ) {
            await (tx as any).team.updateMany({
              where: { id: existing.teamId, leaderId: fromProfileId },
              data: { leaderId: null },
            });
          }

          await this.syncProfileCacheAfterRemoval(
            tx,
            fromProfileId,
            [existing.id],
            existing.gnId ?? null,
          );
        } else {
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
            data: { revokedAt: now },
          });
        }

        const newAssignment = await this.grantAssignment(
          tx,
          actor,
          toProfile,
          resolved,
          dto.note,
        );

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
   * Grants a territory assignment to target inside a transaction.
   * For CDC Secretaries at GN level, supports concurrent multi-GN assignments
   * while cleanly handing over the target GN from any prior CDC Secretary holder.
   */
  private async grantAssignment(
    tx: any,
    actor: ScopeContext,
    target: { id: string; role: UserRole },
    resolved: Territory,
    note?: string | null,
  ) {
    const now = new Date();
    const isMultiGnSecretary =
      target.role === UserRole.cdc_secretary && Boolean(resolved.gnId);

    if (isMultiGnSecretary && resolved.gnId) {
      await this.displaceOtherSecretaryOnGn(
        tx,
        actor,
        target.id,
        resolved.gnId,
        now,
      );

      // Replace only any active assignment on THIS same GN (or non-GN fallback)
      // while leaving the secretary's other active GN assignments intact.
      const ownAaRows = await this.findOpenRows(tx.accountAssignment, {
        profileId: target.id,
        validTo: null,
      });
      for (const aa of ownAaRows) {
        if (!aa || aa.profileId !== target.id) continue;
        if (!aa.gnId || aa.gnId === resolved.gnId) {
          await tx.accountAssignment.update({
            where: { id: aa.id },
            data: { validTo: now, endedBy: actor.userId },
          });
        }
      }

      await this.closeOpenProfileAssignments(
        tx,
        { profileId: target.id, gnId: resolved.gnId },
        now,
      );
    } else {
      const ownAaRows = await this.findOpenRows(tx.accountAssignment, {
        profileId: target.id,
        validTo: null,
      });
      for (const aa of ownAaRows) {
        if (!aa || aa.profileId !== target.id) continue;
        await tx.accountAssignment.update({
          where: { id: aa.id },
          data: { validTo: now, endedBy: actor.userId },
        });
      }
      await this.closeOpenProfileAssignments(tx, { profileId: target.id }, now);
    }

    const assignment = await tx.accountAssignment.create({
      data: {
        profileId: target.id,
        districtId: resolved.districtId ?? null,
        dsId: resolved.dsId ?? null,
        gnId: resolved.gnId ?? null,
        teamId: resolved.teamId ?? null,
        assignedBy: actor.userId,
        note: note ?? null,
        validFrom: now,
      },
    });

    await tx.profile.update({
      where: { id: target.id },
      data: {
        districtId: resolved.districtId ?? null,
        dsId: resolved.dsId ?? null,
        gnId: resolved.gnId ?? null,
        teamId: resolved.teamId ?? null,
        tokenVersion: { increment: 1 },
      },
    });

    if (isMultiGnSecretary && resolved.gnId) {
      if (tx.profileAssignment) {
        await tx.profileAssignment.create({
          data: {
            profileId: target.id,
            gnId: resolved.gnId,
            teamId: resolved.teamId ?? null,
            validFrom: now,
          },
        });
      }
      if (resolved.teamId && tx.team) {
        await tx.team.update({
          where: { id: resolved.teamId },
          data: { leaderId: target.id },
        });
      }
    }

    return assignment;
  }

  /**
   * Ends only the target GN assignment for any other CDC Secretary currently
   * holding gnId so they retain their other GN assignments during a handover.
   */
  private async displaceOtherSecretaryOnGn(
    tx: any,
    actor: ScopeContext,
    newHolderId: string,
    gnId: string,
    now: Date,
  ) {
    const displacedByAccount = new Map<string, string[]>();
    const displacedTeamIds = new Set<string>();

    const otherPaRows = await this.findOpenRows(tx.profileAssignment, {
      gnId,
      validTo: null,
      profileId: { not: newHolderId },
    });
    for (const pa of otherPaRows) {
      if (!pa || pa.profileId === newHolderId || pa.gnId !== gnId) continue;
      await tx.profileAssignment.update({
        where: { id: pa.id },
        data: { validTo: now },
      });
      if (!displacedByAccount.has(pa.profileId)) {
        displacedByAccount.set(pa.profileId, []);
      }
      if (pa.teamId) displacedTeamIds.add(pa.teamId);
    }

    const otherAaRows = await this.findOpenRows(
      tx.accountAssignment,
      {
        gnId,
        validTo: null,
        profileId: { not: newHolderId },
      },
      { profile: { select: { role: true } } },
    );
    for (const aa of otherAaRows) {
      if (!aa || aa.profileId === newHolderId || aa.gnId !== gnId) continue;
      const isDisplacedSecretary =
        aa.profile?.role === UserRole.cdc_secretary ||
        displacedByAccount.has(aa.profileId);
      if (!isDisplacedSecretary) continue;

      await tx.accountAssignment.update({
        where: { id: aa.id },
        data: { validTo: now, endedBy: actor.userId },
      });
      const list = displacedByAccount.get(aa.profileId) ?? [];
      list.push(aa.id);
      displacedByAccount.set(aa.profileId, list);
      if (aa.teamId) displacedTeamIds.add(aa.teamId);
    }

    if (displacedTeamIds.size > 0 && tx.team && typeof tx.team.updateMany === 'function') {
      const displacedIds = Array.from(displacedByAccount.keys());
      for (const teamId of displacedTeamIds) {
        await tx.team.updateMany({
          where: { id: teamId, leaderId: { in: displacedIds } },
          data: { leaderId: null },
        });
      }
    }

    for (const [oldHolderId, closedIds] of displacedByAccount.entries()) {
      await this.syncProfileCacheAfterRemoval(tx, oldHolderId, closedIds, gnId);
      await tx.accountAudit.create({
        data: {
          actorId: actor.userId,
          targetId: oldHolderId,
          action: 'assignment_ended',
        },
      });
    }
  }

  /**
   * Updates a profile's cached territory after closing assignment(s):
   * switches cache to a remaining open assignment if present, or clears it
   * fail-closed and revokes all refresh tokens if none remain.
   */
  private async syncProfileCacheAfterRemoval(
    tx: any,
    profileId: string,
    closedIds: string[],
    removedGnId?: string | null,
  ) {
    const remaining = await tx.accountAssignment.findFirst({
      where: {
        profileId,
        validTo: null,
        ...(closedIds.length > 0 ? { id: { notIn: closedIds } } : {}),
      },
      orderBy: { validFrom: 'desc' },
    });
    const nextActive =
      remaining && !closedIds.includes(remaining.id) ? remaining : null;

    if (nextActive) {
      await tx.profile.update({
        where: { id: profileId },
        data: {
          districtId: nextActive.districtId ?? null,
          dsId: nextActive.dsId ?? null,
          gnId: nextActive.gnId ?? null,
          teamId: nextActive.teamId ?? null,
          tokenVersion: { increment: 1 },
        },
      });
      if (removedGnId && tx.refreshToken?.updateMany) {
        await tx.refreshToken.updateMany({
          where: { profileId, activeGnId: removedGnId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return;
    }

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

    await tx.refreshToken.updateMany({
      where: { profileId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async findOpenRows(repo: any, where: any, include?: any): Promise<any[]> {
    if (!repo) return [];
    if (typeof repo.findMany === 'function') {
      return repo.findMany({ where, ...(include ? { include } : {}) });
    }
    if (typeof repo.findFirst === 'function') {
      const one = await repo.findFirst({ where, ...(include ? { include } : {}) });
      return one ? [one] : [];
    }
    return [];
  }

  private async closeOpenProfileAssignments(
    tx: any,
    filter: { profileId: string; gnId?: string },
    now: Date,
  ) {
    if (!tx.profileAssignment) return;
    const rows = await this.findOpenRows(tx.profileAssignment, {
      profileId: filter.profileId,
      ...(filter.gnId ? { gnId: filter.gnId } : {}),
      validTo: null,
    });
    for (const pa of rows) {
      if (!pa || pa.profileId !== filter.profileId) continue;
      if (filter.gnId && pa.gnId !== filter.gnId) continue;
      await tx.profileAssignment.update({
        where: { id: pa.id },
        data: { validTo: now },
      });
    }
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
