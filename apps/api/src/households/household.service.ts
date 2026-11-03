import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope/scope.service';
import { ScopeContext, UserRole } from '../common/scope/scope.types';
import { GrsValidators } from '../common/validators/grs-validators';
import {
  CreateHouseholdDto,
  UpdateHouseholdDto,
  DeleteHouseholdDto,
  ListHouseholdsDto,
} from './dto/household.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class HouseholdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: ScopeService,
  ) { }

  /**
   * Creates a household in the designated GN division with concurrency-safe serial allocation.
   * Invariant §7.1, §8.4, Milestone 4.1:
   * 50 concurrent creates give 50 unique serials without gaps or collisions.
   */
  async createHousehold(
    creator: ScopeContext,
    dto: CreateHouseholdDto,
  ): Promise<any> {
    const targetGnId = dto.gnId || creator.gnId;

    if (!targetGnId) {
      throw new BadRequestException({
        code: 'MISSING_GN_ID',
        message: 'GN division ID is required',
      });
    }

    // Role scope enforcement (M1.10 / M4.1)
    if (creator.role === UserRole.cdc_secretary) {
      if (!creator.gnId || targetGnId !== creator.gnId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_GN',
          message:
            'CDC Secretary can only create households in their own assigned GN division',
        });
      }
    } else if (creator.role !== UserRole.super_admin) {
      throw new ForbiddenException({
        code: 'CANNOT_CREATE_HOUSEHOLD',
        message: `Role ${creator.role} is not permitted to create households`,
      });
    }

    const normResult = GrsValidators.normalizeHouseNo(dto.houseNo);
    if (!normResult.isValid || !normResult.value) {
      throw new BadRequestException({
        code: 'INVALID_HOUSE_NO',
        message: 'House number is required and cannot be empty',
      });
    }
    const houseNoNorm = normResult.value;

    const gn = await this.prisma.gnDivision.findUnique({
      where: { id: targetGnId },
      include: {
        ds: true,
      },
    });

    if (!gn) {
      throw new NotFoundException({
        code: 'GN_NOT_FOUND',
        message: 'GN division not found',
      });
    }

    if (dto.districtId && dto.districtId !== gn.ds.districtId) {
      throw new BadRequestException({
        code: 'INVALID_DISTRICT_HIERARCHY',
        message: 'Provided districtId does not match the GN division hierarchy',
      });
    }

    if (dto.dsId && dto.dsId !== gn.dsId) {
      throw new BadRequestException({
        code: 'INVALID_DS_HIERARCHY',
        message: 'Provided dsId does not match the GN division hierarchy',
      });
    }

    const resolvedDistrictId = gn.ds.districtId;
    const resolvedDsId = gn.dsId;

    if (dto.teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: dto.teamId },
      });
      if (!team) {
        throw new NotFoundException({
          code: 'TEAM_NOT_FOUND',
          message: 'Assigned team not found',
        });
      }
      if (team.gnId !== targetGnId) {
        throw new BadRequestException({
          code: 'INVALID_TEAM_HIERARCHY',
          message: 'Team does not belong to the specified GN division',
        });
      }
      if (
        creator.role === UserRole.cdc_secretary &&
        creator.teamId &&
        dto.teamId !== creator.teamId
      ) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_TEAM',
          message:
            'CDC Secretary can only assign new households to their own team',
        });
      }
    }

    // Concurrency-safe atomic serial allocation and duplicate house number check inside transaction
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // 1. Take row-level lock on gn_divisions FIRST to serialize concurrent creates and checks in this GN
          // Guaranteed: 50 concurrent creates yield 50 unique serial numbers (1..50)
          const gnRows = await tx.$queryRawUnsafe<
            Array<{ next_serial: number }>
          >(
            `SELECT next_serial FROM gn_divisions WHERE id = $1::uuid FOR UPDATE`,
            targetGnId,
          );

          const allocatedSerial = gnRows[0]?.next_serial ?? 1;

          // 2. Check duplicate house number in GN division (deletedAt IS NULL) under row lock
          const duplicate = await tx.household.findFirst({
            where: {
              gnId: targetGnId,
              houseNoNorm,
              deletedAt: null,
            },
          });

          if (duplicate) {
            throw new ConflictException({
              code: 'DUPLICATE_HOUSE_NUMBER',
              message: `House number '${dto.houseNo}' already exists in this GN division`,
            });
          }

          await tx.$queryRawUnsafe(
            `UPDATE gn_divisions SET next_serial = next_serial + 1, updated_at = now() WHERE id = $1::uuid`,
            targetGnId,
          );

          // 3. Insert household record
          const household = await tx.household.create({
            data: {
              gnId: targetGnId,
              dsId: resolvedDsId,
              districtId: resolvedDistrictId,
              teamId: dto.teamId || null,
              serialNo: allocatedSerial,
              houseNo: dto.houseNo.trim(),
              houseNoNorm,
              houseLeaderName: dto.houseLeaderName.trim(),
              address: dto.address?.trim() || null,
              villageName: dto.villageName?.trim() || null,
              isEpf: dto.isEpf ?? false,
              isEtf: dto.isEtf ?? false,
              isAswesuma: dto.isAswesuma ?? false,
              isSamurdhi: dto.isSamurdhi ?? false,
              hasSpecialNeeds: dto.hasSpecialNeeds ?? false,
              targetFemale: dto.targetFemale ?? 0,
              targetMale: dto.targetMale ?? 0,
              ageGroupMin: dto.ageGroupMin ?? null,
              ageGroupMax: dto.ageGroupMax ?? null,
              langSinhala: dto.langSinhala ?? false,
              langTamil: dto.langTamil ?? false,
              langEnglish: dto.langEnglish ?? false,
              createdBy: creator.userId,
            },
          });

          return household;
        },
        { maxWait: 20000, timeout: 60000 },
      );

    } catch (err: any) {
      if (err instanceof ConflictException) throw err;
      if (
        err?.code === 'P2002' ||
        (err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002')
      ) {
        throw new ConflictException({
          code: 'DUPLICATE_HOUSE_NUMBER',
          message: `House number '${dto.houseNo}' already exists in this GN division`,
        });
      }
      throw err;
    }
  }

  /**
   * Retrieves households within the caller's authorized territorial scope.
   */
  async getHouseholds(
    caller: ScopeContext,
    query: ListHouseholdsDto,
  ): Promise<{ households: any[]; totalCount: number; nextCursor?: string }> {
    const whereCondition: Record<string, any> = { deletedAt: null };

    if (caller.role === UserRole.cdc_secretary) {
      // CDC Secretary scope: their GN division
      if (!caller.gnId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_SCOPE',
          message: 'CDC Secretary missing GN division scope',
        });
      }
      whereCondition.gnId = caller.gnId;

      if (query.unassignedOnly) {
        whereCondition.teamId = null;
      } else if (query.teamId) {
        whereCondition.teamId = query.teamId;
      }
    } else if (caller.role === UserRole.team_member) {
      // Team member scope: assigned team
      if (!caller.teamId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_SCOPE',
          message: 'Team member missing team scope',
        });
      }
      whereCondition.teamId = caller.teamId;
    } else {
      // Higher roles: use scope service filter
      const filter = this.scopeService.getHouseholdScopeFilter(caller);
      Object.assign(whereCondition, filter);

      if (query.gnId) whereCondition.gnId = query.gnId;
      if (query.teamId) whereCondition.teamId = query.teamId;
      if (query.unassignedOnly) whereCondition.teamId = null;
    }

    if (query.search) {
      const search = query.search.trim();
      const callerTeamFilter = caller.teamId ? [{ teamId: caller.teamId }] : [];
      const leaderNameCondition =
        caller.role === UserRole.cdc_secretary
          ? {
            AND: [
              { houseLeaderName: { contains: search, mode: 'insensitive' } },
              {
                OR: [...callerTeamFilter, { teamId: null }],
              },
            ],
          }
          : { houseLeaderName: { contains: search, mode: 'insensitive' } };

      const searchConditions = [
        { houseNo: { contains: search, mode: 'insensitive' } },
        leaderNameCondition,
        { villageName: { contains: search, mode: 'insensitive' } },
      ];

      if (whereCondition.OR) {
        const scopeOr = whereCondition.OR;
        delete whereCondition.OR;
        whereCondition.AND = [
          ...(Array.isArray(whereCondition.AND)
            ? whereCondition.AND
            : whereCondition.AND
              ? [whereCondition.AND]
              : []),
          { OR: scopeOr },
          { OR: searchConditions },
        ];
      } else if (whereCondition.AND) {
        whereCondition.AND = [
          ...(Array.isArray(whereCondition.AND)
            ? whereCondition.AND
            : [whereCondition.AND]),
          { OR: searchConditions },
        ];
      } else {
        whereCondition.OR = searchConditions;
      }
    }

    const limit = query.limit ?? 50;

    const [households, totalCount] = await Promise.all([
      this.prisma.household.findMany({
        where: whereCondition,
        take: limit + 1,
        orderBy: [{ serialNo: 'asc' }, { id: 'asc' }],
        include: {
          team: {
            select: { id: true, teamNo: true },
          },
        },
        ...(query.cursor && query.cursor.trim().length > 0
          ? {
            cursor: { id: query.cursor.trim() },
            skip: 1,
          }
          : {}),
      }),
      this.prisma.household.count({ where: whereCondition }),
    ]);

    let nextCursor: string | undefined;
    if (households.length > limit) {
      households.pop();
      nextCursor = households[households.length - 1]?.id;
    }

    // Mask PII for houses assigned to other teams if caller is Level 4 (Decision C4)
    const sanitized = households.map((h) => {
      if (
        caller.role === UserRole.cdc_secretary &&
        h.teamId &&
        h.teamId !== caller.teamId
      ) {
        return {
          id: h.id,
          serialNo: h.serialNo,
          houseNo: h.houseNo,
          houseLeaderName: `[Assigned to Team ${h.team?.teamNo ?? ''}]`,
          address: null,
          villageName: h.villageName,
          teamId: h.teamId,
          team: h.team,
          isTaken: true,
          version: h.version,
          updatedAt: h.updatedAt,
        };
      }
      return {
        ...h,
        isTaken: h.teamId !== null,
      };
    });

    return {
      households: sanitized,
      totalCount,
      nextCursor,
    };
  }

  /**
   * Retrieves a single household by ID with territorial boundary checks.
   */
  async getHouseholdById(caller: ScopeContext, id: string): Promise<any> {
    const household = await this.prisma.household.findUnique({
      where: { id },
      include: {
        team: { select: { id: true, teamNo: true } },
        gn: { select: { id: true, gnNumber: true, gnName: true } },
      },
    });

    if (!household || household.deletedAt !== null) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found',
      });
    }

    // Territorial scope checks
    if (caller.role === UserRole.cdc_secretary) {
      if (household.gnId !== caller.gnId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_GN',
          message: 'Household is outside your GN division',
        });
      }
      if (household.teamId && household.teamId !== caller.teamId) {
        return {
          ...household,
          houseLeaderName: `[Assigned to Team ${household.team?.teamNo ?? ''}]`,
          address: null,
          isTaken: true,
        };
      }
    } else if (caller.role === UserRole.team_member) {
      if (
        household.teamId !== caller.teamId &&
        household.createdBy !== caller.userId
      ) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_TEAM',
          message: 'Household is not assigned to your team',
        });
      }
    }

    return household;
  }

  /**
   * Updates household pre-visit data (audited, increments version).
   */
  async updateHousehold(
    caller: ScopeContext,
    id: string,
    dto: UpdateHouseholdDto,
  ): Promise<any> {
    const household = await this.getHouseholdById(caller, id);

    let houseNoNorm = household.houseNoNorm;
    const isHouseNoChanged = dto.houseNo && dto.houseNo !== household.houseNo;
    if (isHouseNoChanged) {
      const normResult = GrsValidators.normalizeHouseNo(dto.houseNo);
      if (!normResult.isValid || !normResult.value) {
        throw new BadRequestException({
          code: 'INVALID_HOUSE_NO',
          message: 'House number cannot be empty',
        });
      }
      houseNoNorm = normResult.value;
    }

    try {
      if (isHouseNoChanged) {
        return await this.prisma.$transaction(
          async (tx) => {
            // Row lock GN division to serialize house number updates/creations
            await tx.$queryRawUnsafe(
              `SELECT id FROM gn_divisions WHERE id = $1::uuid FOR UPDATE`,
              household.gnId,
            );

            const duplicate = await tx.household.findFirst({
              where: {
                gnId: household.gnId,
                houseNoNorm,
                deletedAt: null,
                id: { not: id },
              },
            });
            if (duplicate) {
              throw new ConflictException({
                code: 'DUPLICATE_HOUSE_NUMBER',
                message: `House number '${dto.houseNo}' already exists in this GN division`,
              });
            }

            return await tx.household.update({
              where: { id },
              data: {
                houseNo: dto.houseNo ? dto.houseNo.trim() : undefined,
                houseNoNorm,
                houseLeaderName: dto.houseLeaderName
                  ? dto.houseLeaderName.trim()
                  : undefined,
                address:
                  dto.address !== undefined
                    ? dto.address?.trim() || null
                    : undefined,
                villageName:
                  dto.villageName !== undefined
                    ? dto.villageName?.trim() || null
                    : undefined,
                isEpf: dto.isEpf,
                isEtf: dto.isEtf,
                isAswesuma: dto.isAswesuma,
                isSamurdhi: dto.isSamurdhi,
                hasSpecialNeeds: dto.hasSpecialNeeds,
                targetFemale: dto.targetFemale,
                targetMale: dto.targetMale,
                ageGroupMin: dto.ageGroupMin,
                ageGroupMax: dto.ageGroupMax,
                langSinhala: dto.langSinhala,
                langTamil: dto.langTamil,
                langEnglish: dto.langEnglish,
                version: { increment: 1 },
                updatedBy: caller.userId,
              },
            });
          },
          { maxWait: 10000, timeout: 30000 },
        );
      } else {
        return await this.prisma.household.update({
          where: { id },
          data: {
            houseLeaderName: dto.houseLeaderName
              ? dto.houseLeaderName.trim()
              : undefined,
            address:
              dto.address !== undefined
                ? dto.address?.trim() || null
                : undefined,
            villageName:
              dto.villageName !== undefined
                ? dto.villageName?.trim() || null
                : undefined,
            isEpf: dto.isEpf,
            isEtf: dto.isEtf,
            isAswesuma: dto.isAswesuma,
            isSamurdhi: dto.isSamurdhi,
            hasSpecialNeeds: dto.hasSpecialNeeds,
            targetFemale: dto.targetFemale,
            targetMale: dto.targetMale,
            ageGroupMin: dto.ageGroupMin,
            ageGroupMax: dto.ageGroupMax,
            langSinhala: dto.langSinhala,
            langTamil: dto.langTamil,
            langEnglish: dto.langEnglish,
            version: { increment: 1 },
            updatedBy: caller.userId,
          },
        });
      }
    } catch (err: any) {
      if (err instanceof ConflictException) throw err;
      if (
        err?.code === 'P2002' ||
        (err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002')
      ) {
        throw new ConflictException({
          code: 'DUPLICATE_HOUSE_NUMBER',
          message: `House number '${dto.houseNo || household.houseNo}' already exists in this GN division`,
        });
      }
      throw err;
    }
  }

  /**
   * Soft deletes a household.
   * Decision C6:
   * Deletion blocked if active clients exist unless explicitly reassigned or deleted.
   * Soft-deleted clients do not block household deletion.
   * Clients are never cascade-deleted.
   */
  async deleteHousehold(
    caller: ScopeContext,
    id: string,
    dto?: DeleteHouseholdDto,
  ): Promise<{ success: boolean; id: string }> {
    const household = await this.getHouseholdById(caller, id);

    return this.prisma.$transaction(
      async (tx) => {
        // Decision C6 check: Are any ACTIVE clients attached to this household?
        const clientCount = await tx.client.count({
          where: { householdId: id, deletedAt: null },
        });

        if (clientCount > 0) {
          throw new ConflictException({
            code: 'HOUSEHOLD_HAS_CLIENTS',
            message:
              'Cannot delete household with attached active clients. Reassign or delete active clients first per Decision C6.',
            attachedClientsCount: clientCount,
          });
        }

        await tx.household.update({
          where: { id },
          data: {
            deletedAt: new Date(),
            deletedReason: dto?.reason?.trim() || 'Deleted by user',
            version: { increment: 1 },
            updatedBy: caller.userId,
          },
        });

        return { success: true, id };
      },
      { maxWait: 10000, timeout: 10000 },
    );
  }

  /**
   * Race-safe atomic team assignment per Build Plan §8.4 & Milestone 4.2:
   * Two leaders claiming the same house: exactly one wins; the other gets 409 + list.
   */
  async assignHousesToTeam(
    caller: ScopeContext,
    teamId: string,
    rawHouseIds: string[],
  ): Promise<{ success: boolean; assignedCount: number; houseIds: string[] }> {
    if (!rawHouseIds || rawHouseIds.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_HOUSE_LIST',
        message: 'Must provide at least one house ID to assign',
      });
    }

    // Deduplicate house IDs to avoid false conflicts from repeated IDs
    const houseIds = Array.from(new Set(rawHouseIds));

    // Cap array size to prevent database overload
    if (houseIds.length > 200) {
      throw new BadRequestException({
        code: 'TOO_MANY_HOUSES',
        message: 'Cannot assign more than 200 houses in a single request',
      });
    }

    // Scope check: Level 4 can only assign to their own team
    if (caller.role === UserRole.cdc_secretary) {
      if (!caller.teamId || teamId !== caller.teamId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_TEAM',
          message: 'CDC Secretary can only assign houses to their own team',
        });
      }
    } else if (caller.role !== UserRole.super_admin) {
      throw new ForbiddenException({
        code: 'CANNOT_ASSIGN_HOUSES',
        message: `Role ${caller.role} is not permitted to assign houses to teams`,
      });
    }

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { gn: true },
    });

    if (!team) {
      throw new NotFoundException({
        code: 'TEAM_NOT_FOUND',
        message: 'Team not found',
      });
    }

    if (caller.role === UserRole.cdc_secretary) {
      if (!caller.gnId || team.gnId !== caller.gnId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_GN',
          message:
            'CDC Secretary can only assign houses in their own assigned GN division',
        });
      }
    }

    const teamGnId = team.gnId;

    return this.prisma.$transaction(
      async (tx) => {
        // Build Plan §8.4: Atomic conditional update
        // UPDATE households SET team_id = :team, version = version + 1
        // WHERE id = ANY(:ids) AND gn_id = :gn AND team_id IS NULL AND deleted_at IS NULL;
        const updated = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `UPDATE households
           SET team_id = $1::uuid, version = version + 1, updated_at = now()
           WHERE id = ANY($2::uuid[])
             AND gn_id = $3::uuid
             AND team_id IS NULL
             AND deleted_at IS NULL
           RETURNING id;`,
          teamId,
          houseIds,
          teamGnId,
        );

        // If rowcount <> array_length(:ids) -> ROLLBACK, return 409 with the ids that were taken
        if (updated.length !== houseIds.length) {
          const claimedSet = new Set(updated.map((u) => u.id));
          const unavailable = houseIds.filter((id) => !claimedSet.has(id));

          const conflicts = await tx.household.findMany({
            where: { id: { in: unavailable } },
            select: {
              id: true,
              houseNo: true,
              teamId: true,
              deletedAt: true,
              gnId: true,
            },
          });

          throw new ConflictException({
            statusCode: 409,
            code: 'HOUSE_CLAIM_CONFLICT',
            message:
              'One or more houses could not be claimed because they are already assigned to another team or unavailable.',
            unavailableHouseIds: unavailable,
            conflicts: conflicts.map((c) => ({
              id: c.id,
              houseNo: c.houseNo,
              reason:
                c.deletedAt !== null
                  ? 'deleted'
                  : c.teamId !== null
                    ? 'already_assigned'
                    : 'invalid_gn',
            })),
          });
        }

        // When reassigning or assigning houses that already have clients, update those clients' team_id
        await tx.$queryRawUnsafe(
          `UPDATE clients SET team_id = $1::uuid, updated_at = now() WHERE household_id = ANY($2::uuid[])`,
          teamId,
          houseIds,
        );

        // Mark team stats dirty for async roll-up (Build Plan §8.5)
        await tx.$queryRawUnsafe(
          `UPDATE teams SET stats_dirty_at = now() WHERE id = $1::uuid`,
          teamId,
        );

        return {
          success: true,
          assignedCount: updated.length,
          houseIds: updated.map((u) => u.id),
        };
      },
      { maxWait: 30000, timeout: 30000 },
    );
  }

  /**
   * Unassigns a house from a team.
   */
  async unassignHouseFromTeam(
    caller: ScopeContext,
    teamId: string,
    houseId: string,
  ): Promise<{ success: boolean; unassignedHouseId: string }> {
    if (caller.role === UserRole.cdc_secretary) {
      if (!caller.teamId || teamId !== caller.teamId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_TEAM',
          message: 'CDC Secretary can only unassign houses from their own team',
        });
      }
    } else if (caller.role !== UserRole.super_admin) {
      throw new ForbiddenException({
        code: 'CANNOT_UNASSIGN_HOUSE',
        message: `Role ${caller.role} is not permitted to unassign houses`,
      });
    }

    const house = await this.prisma.household.findUnique({
      where: { id: houseId },
    });

    if (!house || house.deletedAt !== null) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found',
      });
    }

    if (caller.role === UserRole.cdc_secretary) {
      if (!caller.gnId || house.gnId !== caller.gnId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_GN',
          message:
            'CDC Secretary can only unassign houses in their own assigned GN division',
        });
      }
    }

    if (house.teamId !== teamId) {
      throw new BadRequestException({
        code: 'HOUSE_NOT_IN_TEAM',
        message: 'Household is not assigned to the specified team',
      });
    }

    return this.prisma.$transaction(
      async (tx) => {
        // Build Plan §8.4 / Unassign rules:
        // Unassign is permitted ONLY when there are no clients. If clients exist, reassign instead.
        const clientCount = await tx.client.count({
          where: { householdId: houseId, deletedAt: null },
        });

        if (clientCount > 0) {
          throw new ConflictException({
            code: 'HOUSEHOLD_HAS_CLIENTS',
            message:
              'Cannot unassign house with existing client records. Reassign to another team instead per Build Plan §8.4.',
            attachedClientsCount: clientCount,
          });
        }

        await tx.household.update({
          where: { id: houseId },
          data: {
            teamId: null,
            version: { increment: 1 },
            updatedBy: caller.userId,
          },
        });

        // Record unassignment for this team so /sync/changes will inform the phone to remove it
        await tx.householdUnassignment.create({
          data: {
            householdId: houseId,
            teamId: teamId,
            unassignedBy: caller.userId,
          },
        });

        await tx.team.update({
          where: { id: teamId },
          data: { statsDirtyAt: new Date() },
        });

        return { success: true, unassignedHouseId: houseId };
      },
      { maxWait: 30000, timeout: 30000 },
    );
  }

  /**
   * Reassigns a house from one team to another (Build Plan §8.4):
   * When reassigning a house that already has clients, updates the household's team_id
   * AND updates those clients' denormalized team_id in the same atomic transaction.
   * Also records an unassignment event for the old team so their phones remove it.
   */
  async reassignHouseToTeam(
    caller: ScopeContext,
    targetTeamId: string,
    houseId: string,
  ): Promise<{
    success: boolean;
    householdId: string;
    previousTeamId: string | null;
    newTeamId: string;
    reassignedClientsCount: number;
  }> {
    const house = await this.prisma.household.findUnique({
      where: { id: houseId },
      include: { team: true },
    });

    if (!house || house.deletedAt !== null) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found',
      });
    }

    const targetTeam = await this.prisma.team.findUnique({
      where: { id: targetTeamId },
    });

    if (!targetTeam) {
      throw new NotFoundException({
        code: 'TEAM_NOT_FOUND',
        message: 'Target team not found',
      });
    }

    if (targetTeam.gnId !== house.gnId) {
      throw new BadRequestException({
        code: 'TEAM_GN_MISMATCH',
        message: 'Target team must be in the same GN division as the household',
      });
    }

    // Build Plan §8.4: Only Level 00 (Super Admin) is permitted to reassign houses
    if (caller.role !== UserRole.super_admin) {
      throw new ForbiddenException({
        code: 'CANNOT_REASSIGN_HOUSE',
        message: 'Only Level 00 (Super Admin) is permitted to reassign houses',
      });
    }

    const previousTeamId = house.teamId;

    return this.prisma.$transaction(
      async (tx) => {
        // 1. Update household team
        await tx.household.update({
          where: { id: houseId },
          data: {
            teamId: targetTeamId,
            version: { increment: 1 },
            updatedBy: caller.userId,
          },
        });

        // 2. Build Plan §8.4: Update those clients' denormalized team_id in the same transaction
        const clientUpdate = await tx.client.updateMany({
          where: { householdId: houseId, deletedAt: null },
          data: { teamId: targetTeamId },
        });

        // 3. If it had a previous team, record unassignment so the previous team's phones get notified via /sync/changes
        if (previousTeamId && previousTeamId !== targetTeamId) {
          await tx.householdUnassignment.create({
            data: {
              householdId: houseId,
              teamId: previousTeamId,
              unassignedBy: caller.userId,
            },
          });

          await tx.team.update({
            where: { id: previousTeamId },
            data: { statsDirtyAt: new Date() },
          });
        }

        // 4. Dirty target team stats
        await tx.team.update({
          where: { id: targetTeamId },
          data: { statsDirtyAt: new Date() },
        });

        return {
          success: true,
          householdId: houseId,
          previousTeamId,
          newTeamId: targetTeamId,
          reassignedClientsCount: clientUpdate.count,
        };
      },
      { maxWait: 30000, timeout: 30000 },
    );
  }

  /**
   * Marks a household visit as completed (M4 / Finish house).
   * Updates visit_status, finished_at, finished_by, increments version, and marks team dirty for stats refresh.
   */
  async finishHousehold(caller: ScopeContext, id: string): Promise<any> {
    const household = await this.prisma.household.findUnique({
      where: { id },
      include: { team: true },
    });

    if (!household || household.deletedAt) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found',
      });
    }

    if (
      caller.role === UserRole.team_member ||
      caller.role === UserRole.cdc_secretary
    ) {
      if (
        !caller.teamId ||
        !household.teamId ||
        household.teamId !== caller.teamId
      ) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_TEAM',
          message: 'Household is not assigned to your team',
        });
      }
    } else if (caller.role === UserRole.sda) {
      if (caller.dsId && household.dsId !== caller.dsId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_DS',
          message: 'Household is outside your division',
        });
      }
    } else if (caller.role === UserRole.dc) {
      if (caller.districtId && household.districtId !== caller.districtId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_DISTRICT',
          message: 'Household is outside your district',
        });
      }
    }

    // Idempotency: if already marked completed, return existing household without re-dirtying stats or bumping version
    if (household.visitStatus === 'completed') {
      return household;
    }

    const now = new Date();
    const updated = await this.prisma.household.update({
      where: { id },
      data: {
        visitStatus: 'completed',
        finishedAt: now,
        finishedBy: caller.userId,
        version: { increment: 1 },
        updatedAt: now,
      },
    });

    if (household.teamId) {
      if (typeof (this.prisma as any).$executeRawUnsafe === 'function') {
        await (this.prisma as any).$executeRawUnsafe(
          `UPDATE teams SET stats_dirty_at = now() WHERE id = $1::uuid`,
          household.teamId,
        );
      } else if (typeof (this.prisma as any).$queryRawUnsafe === 'function') {
        await (this.prisma as any).$queryRawUnsafe(
          `UPDATE teams SET stats_dirty_at = now() WHERE id = $1::uuid`,
          household.teamId,
        );
      } else if (this.prisma.team?.update) {
        await this.prisma.team.update({
          where: { id: household.teamId },
          data: { statsDirtyAt: now },
        });
      }
    }

    return updated;
  }

  /**
   * Reopens a completed household visit (Reopen house).
   * Restricted to Team Leader (CDC Secretary) and administrative roles.
   * Resets visit_status to 'in_progress' (or 'not_started' if no active clients exist),
   * clears finished_at and finished_by, increments version, and dirties team stats.
   */
  async reopenHousehold(caller: ScopeContext, id: string): Promise<any> {
    const household = await this.prisma.household.findUnique({
      where: { id },
      include: {
        team: true,
        clients: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    });

    if (!household || household.deletedAt) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found',
      });
    }

    if (caller.role === UserRole.team_member) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_SCOPE',
        message: 'Level 5 enumerators cannot reopen finished houses. Contact your team leader.',
      });
    } else if (caller.role === UserRole.cdc_secretary) {
      if (
        !caller.teamId ||
        !household.teamId ||
        household.teamId !== caller.teamId
      ) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_TEAM',
          message: 'Household is not assigned to your team',
        });
      }
    } else if (caller.role === UserRole.sda) {
      if (caller.dsId && household.dsId !== caller.dsId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_DS',
          message: 'Household is outside your division',
        });
      }
    } else if (caller.role === UserRole.dc) {
      if (caller.districtId && household.districtId !== caller.districtId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_DISTRICT',
          message: 'Household is outside your district',
        });
      }
    }

    // Idempotency: if already not marked completed, return current state
    if (household.visitStatus !== 'completed') {
      return household;
    }

    const activeClientsCount = household.clients?.length ?? 0;
    const nextStatus = activeClientsCount > 0 ? 'in_progress' : 'not_started';
    const now = new Date();

    const updated = await this.prisma.household.update({
      where: { id },
      data: {
        visitStatus: nextStatus,
        finishedAt: null,
        finishedBy: null,
        version: { increment: 1 },
        updatedAt: now,
      },
    });

    if (household.teamId) {
      if (typeof (this.prisma as any).$executeRawUnsafe === 'function') {
        await (this.prisma as any).$executeRawUnsafe(
          `UPDATE teams SET stats_dirty_at = now() WHERE id = $1::uuid`,
          household.teamId,
        );
      } else if (typeof (this.prisma as any).$queryRawUnsafe === 'function') {
        await (this.prisma as any).$queryRawUnsafe(
          `UPDATE teams SET stats_dirty_at = now() WHERE id = $1::uuid`,
          household.teamId,
        );
      } else if (this.prisma.team?.update) {
        await this.prisma.team.update({
          where: { id: household.teamId },
          data: { statsDirtyAt: now },
        });
      }
    }

    return updated;
  }
}
