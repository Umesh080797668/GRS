import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialService } from '../auth/credential.service';
import { SessionActivityService } from '../auth/session-activity.service';
import { ScopeService } from '../common/scope/scope.service';
import { GrsValidators } from '../common/validators/grs-validators';
import {
  ScopeContext,
  UserRole,
  canCreateRole,
  getRoleRank,
} from '../common/scope/scope.types';
import { CreateAccountDto } from './dto/create-account.dto';
import { CreateBulkAccountsDto } from './dto/create-bulk-accounts.dto';
import { ListAccountsDto } from './dto/list-accounts.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { Prisma } from '@prisma/client';

export interface CreatedAccountResponse {
  id: string;
  userCode: string;
  fullName: string;
  role: UserRole;
  teamId?: string | null;
  gnId?: string | null;
  initialPassword: string;
  passwordExpiresAt: Date;
}

@Injectable()
export class AccountService {
  private static readonly INITIAL_PASSWORD_TTL_DAYS = 30; // Decision C14

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialService: CredentialService,
    private readonly scopeService: ScopeService,
    @Optional()
    private readonly sessionActivityService?: SessionActivityService,
  ) { }

  /**
   * Creates a single account with generated credentials.
   * Enforces role creation matrix, territorial scope, and team capacity.
   */
  async createAccount(
    creatorScope: ScopeContext,
    dto: CreateAccountDto,
  ): Promise<{ user: CreatedAccountResponse }> {
    const resolvedTerritory = await this.assertCanCreate(
      creatorScope,
      dto.role,
      dto.districtId,
      dto.dsId,
      dto.gnId,
      dto.teamId,
    );

    const ttlMs =
      AccountService.INITIAL_PASSWORD_TTL_DAYS * 24 * 60 * 60 * 1000;
    const passwordExpiresAt = new Date(Date.now() + ttlMs);

    let phoneE164: string | undefined = undefined;
    if (dto.phoneE164 && dto.phoneE164.trim().length > 0) {
      const pRes = GrsValidators.normalizePhone(dto.phoneE164);
      if (!pRes.isValid) {
        throw new BadRequestException({
          code: 'INVALID_PHONE_NUMBER',
          message: `Invalid phone number format: ${dto.phoneE164}`,
        });
      }
      phoneE164 = pRes.value!;
    }

    // Pre-generate credentials outside transaction to minimize lock holding time
    const { raw, display } = this.credentialService.generateInitialPassword();
    const passwordHash = await this.credentialService.hashInitialPassword(raw);

    const created = await this.prisma.$transaction(
      async (tx) => {
        let teamGnId: string | undefined;

        // Atomic team member limit enforcement (C8)
        if (dto.role === UserRole.team_member && resolvedTerritory.teamId) {
          teamGnId = await this.assertTeamCapacity(
            tx,
            resolvedTerritory.teamId,
            1,
          );
        }

        const gnId = resolvedTerritory.gnId || teamGnId || undefined;
        let profile: any;
        for (let retry = 0; retry < 5; retry++) {
          const userCode = this.credentialService.generateUserCode();
          try {
            profile = await tx.profile.create({
              data: {
                userCode,
                fullName: dto.fullName,
                role: dto.role,
                passwordHash,
                phoneE164,
                preferredLanguage: dto.preferredLanguage || 'si',
                districtId: resolvedTerritory.districtId,
                dsId: resolvedTerritory.dsId,
                gnId,
                teamId: resolvedTerritory.teamId,
                createdBy: creatorScope.userId,
                mustChangePassword: true,
                passwordExpiresAt,
                isActive: true,
              },
            });
            break;
          } catch (err: any) {
            const isUserCodeConflict =
              err?.code === 'P2002' ||
              (typeof err?.message === 'string' &&
                (err.message.includes('user_code') ||
                  err.message.includes('userCode') ||
                  err.message.includes('Unique constraint')));
            if (isUserCodeConflict && retry < 4) {
              continue;
            }
            throw err;
          }
        }

        // Keep teams.leader_id in sync when creating a CDC secretary (team leader)
        if (dto.role === UserRole.cdc_secretary && resolvedTerritory.teamId) {
          await tx.team.update({
            where: { id: resolvedTerritory.teamId },
            data: { leaderId: profile.id },
          });
        }

        // Record initial active GN assignment in profile_assignments table
        if (
          dto.role === UserRole.cdc_secretary &&
          resolvedTerritory.gnId &&
          tx.profileAssignment
        ) {
          await tx.profileAssignment.create({
            data: {
              profileId: profile.id,
              gnId: resolvedTerritory.gnId,
              teamId: resolvedTerritory.teamId,
              validFrom: new Date(),
            },
          });
        }

        // Record initial active territory assignment in account_assignments
        if (
          (resolvedTerritory.districtId ||
            resolvedTerritory.dsId ||
            gnId ||
            resolvedTerritory.teamId) &&
          (tx as any).accountAssignment
        ) {
          await (tx as any).accountAssignment.create({
            data: {
              profileId: profile.id,
              districtId: resolvedTerritory.districtId ?? null,
              dsId: resolvedTerritory.dsId ?? null,
              gnId: gnId ?? null,
              teamId: resolvedTerritory.teamId ?? null,
              assignedBy: creatorScope.userId,
              validFrom: new Date(),
            },
          });
        }

        await tx.accountAudit.create({
          data: {
            actorId: creatorScope.userId,
            targetId: profile.id,
            action: 'created',
          },
        });

        return {
          id: profile.id,
          userCode: profile.userCode,
          fullName: profile.fullName,
          role: profile.role,
          teamId: profile.teamId,
          gnId: profile.gnId,
          initialPassword: display,
          passwordExpiresAt,
        };
      },
      { maxWait: 45000, timeout: 45000 },
    );

    return { user: created };
  }

  /**
   * Creates accounts in bulk (≤100 per request).
   * Atomically checks team capacity. If requested count exceeds available slots,
   * the request is rejected whole with the available slot count (Decision C8).
   */
  async createBulkAccounts(
    creatorScope: ScopeContext,
    dto: CreateBulkAccountsDto,
  ): Promise<{ batchId: string; users: CreatedAccountResponse[] }> {
    const count = dto.count;
    if (count < 1 || count > 100) {
      throw new BadRequestException({
        code: 'INVALID_COUNT',
        message: 'Bulk account creation must be between 1 and 100 accounts',
      });
    }

    if (dto.role === UserRole.cdc_secretary && dto.teamId && count !== 1) {
      throw new BadRequestException({
        code: 'INVALID_COUNT',
        message:
          'CDC secretary account creation for a specific team must have a count of exactly 1',
      });
    }

    if (dto.members && dto.members.length > count) {
      throw new BadRequestException({
        code: 'MEMBERS_EXCEED_COUNT',
        message: `Members list length (${dto.members.length}) exceeds the requested count (${count})`,
      });
    }

    const resolvedTerritory = await this.assertCanCreate(
      creatorScope,
      dto.role,
      dto.districtId,
      dto.dsId,
      dto.gnId,
      dto.teamId,
    );

    const ttlMs =
      AccountService.INITIAL_PASSWORD_TTL_DAYS * 24 * 60 * 60 * 1000;
    const passwordExpiresAt = new Date(Date.now() + ttlMs);

    // Pre-generate credentials outside transaction to minimize lock holding time
    const roleLabel = this.formatRoleName(dto.role);
    const pregeneratedMembers = [];
    for (let i = 0; i < count; i++) {
      const memberInfo = dto.members && dto.members[i];
      const defaultName = `${roleLabel} ${i + 1}`;
      const fullName = memberInfo?.fullName?.trim() || defaultName;
      let phoneE164: string | undefined = undefined;
      if (memberInfo?.phoneE164 && memberInfo.phoneE164.trim().length > 0) {
        const pRes = GrsValidators.normalizePhone(memberInfo.phoneE164);
        if (!pRes.isValid) {
          throw new BadRequestException({
            code: 'INVALID_PHONE_NUMBER',
            message: `Invalid phone number for member ${i + 1}: ${memberInfo.phoneE164}`,
          });
        }
        phoneE164 = pRes.value!;
      }
      const preferredLanguage = memberInfo?.preferredLanguage || 'si';
      const { raw, display } = this.credentialService.generateInitialPassword();
      pregeneratedMembers.push({
        fullName,
        phoneE164,
        preferredLanguage,
        rawPassword: raw,
        displayPassword: display,
      });
    }

    const hashedMembers = await Promise.all(
      pregeneratedMembers.map(async (m) => ({
        ...m,
        passwordHash: await this.credentialService.hashInitialPassword(
          m.rawPassword,
        ),
      })),
    );

    return this.prisma.$transaction(
      async (tx) => {
        let teamGnId: string | undefined;

        // Atomic team member limit enforcement (C8)
        if (dto.role === UserRole.team_member && resolvedTerritory.teamId) {
          teamGnId = await this.assertTeamCapacity(
            tx,
            resolvedTerritory.teamId,
            count,
          );
        }

        const gnId = resolvedTerritory.gnId || teamGnId || undefined;

        const batch = await tx.accountBatch.create({
          data: {
            createdBy: creatorScope.userId,
            role: dto.role,
            teamId: resolvedTerritory.teamId,
            count,
          },
        });

        const results: CreatedAccountResponse[] = [];

        for (let i = 0; i < count; i++) {
          const m = hashedMembers[i];
          let profile: any;
          for (let retry = 0; retry < 5; retry++) {
            const userCode = this.credentialService.generateUserCode();
            try {
              profile = await tx.profile.create({
                data: {
                  userCode,
                  fullName: m.fullName,
                  role: dto.role,
                  passwordHash: m.passwordHash,
                  phoneE164: m.phoneE164,
                  preferredLanguage: m.preferredLanguage,
                  districtId: resolvedTerritory.districtId,
                  dsId: resolvedTerritory.dsId,
                  gnId,
                  teamId: resolvedTerritory.teamId,
                  createdBy: creatorScope.userId,
                  mustChangePassword: true,
                  passwordExpiresAt,
                  isActive: true,
                },
              });
              break;
            } catch (err: any) {
              const isUserCodeConflict =
                err?.code === 'P2002' ||
                (typeof err?.message === 'string' &&
                  (err.message.includes('user_code') ||
                    err.message.includes('userCode') ||
                    err.message.includes('Unique constraint')));
              if (isUserCodeConflict && retry < 4) {
                continue;
              }
              throw err;
            }
          }

          await tx.accountAudit.create({
            data: {
              actorId: creatorScope.userId,
              targetId: profile.id,
              action: 'created',
              batchId: batch.id,
            },
          });

          if (
            (resolvedTerritory.districtId ||
              resolvedTerritory.dsId ||
              gnId ||
              resolvedTerritory.teamId) &&
            (tx as any).accountAssignment
          ) {
            await (tx as any).accountAssignment.create({
              data: {
                profileId: profile.id,
                districtId: resolvedTerritory.districtId ?? null,
                dsId: resolvedTerritory.dsId ?? null,
                gnId: gnId ?? null,
                teamId: resolvedTerritory.teamId ?? null,
                assignedBy: creatorScope.userId,
                validFrom: new Date(),
              },
            });
          }

          results.push({
            id: profile.id,
            userCode: profile.userCode,
            fullName: profile.fullName,
            role: profile.role,
            teamId: profile.teamId,
            gnId: profile.gnId,
            initialPassword: m.displayPassword,
            passwordExpiresAt,
          });
        }

        if (dto.role === UserRole.cdc_secretary && resolvedTerritory.teamId) {
          await tx.team.update({
            where: { id: resolvedTerritory.teamId },
            data: { leaderId: results[0].id },
          });
        }

        if (
          dto.role === UserRole.cdc_secretary &&
          resolvedTerritory.gnId &&
          results.length > 0 &&
          tx.profileAssignment
        ) {
          await tx.profileAssignment.create({
            data: {
              profileId: results[0].id,
              gnId: resolvedTerritory.gnId,
              teamId: resolvedTerritory.teamId,
              validFrom: new Date(),
            },
          });
        }

        return {
          batchId: batch.id,
          users: results,
        };
      },
      { maxWait: 45000, timeout: 45000 },
    );
  }

  private async assertCanManageTargetProfile(
    adminScope: ScopeContext,
    targetUserId: string,
    actionVerb: string,
  ) {
    const target = await this.prisma.profile.findUnique({
      where: { id: targetUserId },
    });

    if (!target) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Account not found',
      });
    }

    if (getRoleRank(adminScope.role) <= getRoleRank(target.role)) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_RANK',
        message: `Cannot ${actionVerb} an account with equal or higher rank`,
      });
    }

    // CDC Secretary can only manage members in their own team (fail-closed if teamId is missing or doesn't match)
    if (adminScope.role === UserRole.cdc_secretary) {
      if (
        !adminScope.teamId ||
        !target.teamId ||
        target.teamId !== adminScope.teamId
      ) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: `Cannot ${actionVerb} an account outside your team`,
        });
      }
    }

    // SDA can only manage accounts in their DS division or accounts they created
    if (adminScope.role === UserRole.sda) {
      const isCreator = target.createdBy === adminScope.userId;
      const inScope = !!adminScope.dsId && target.dsId === adminScope.dsId;
      if (!isCreator && !inScope) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: `Cannot ${actionVerb} an account outside your DS division`,
        });
      }
    }

    // DC can only manage accounts in their district or accounts they created
    if (adminScope.role === UserRole.dc) {
      const isCreator = target.createdBy === adminScope.userId;
      const inScope =
        !!adminScope.districtId && target.districtId === adminScope.districtId;
      if (!isCreator && !inScope) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: `Cannot ${actionVerb} an account outside your district`,
        });
      }
    }

    return target;
  }

  /**
   * Deactivates a user account.
   * Requires higher role rank and matching territory.
   * Instantly revokes sessions by incrementing token_version (Invariant 14).
   */
  async deactivateAccount(
    adminScope: ScopeContext,
    targetUserId: string,
  ): Promise<void> {
    const target = await this.assertCanManageTargetProfile(
      adminScope,
      targetUserId,
      'deactivate',
    );

    await this.prisma.$transaction(
      async (tx) => {
        await tx.profile.update({
          where: { id: targetUserId },
          data: {
            isActive: false,
            deactivatedAt: new Date(),
            deactivatedBy: adminScope.userId,
            tokenVersion: { increment: 1 },
          },
        });

        // Revoke all refresh tokens
        await tx.refreshToken.deleteMany({
          where: { profileId: targetUserId },
        });

        await this.sessionActivityService?.endSessions(
          { profileId: targetUserId, reason: 'deactivated', all: true },
          tx,
        );

        // Clear leader_id on the team if this deactivated user was the recorded leader
        if (target.role === UserRole.cdc_secretary && target.teamId) {
          await tx.team.updateMany({
            where: { id: target.teamId, leaderId: targetUserId },
            data: { leaderId: null },
          });
        }

        await tx.accountAudit.create({
          data: {
            actorId: adminScope.userId,
            targetId: targetUserId,
            action: 'deactivated',
          },
        });
      },
      { maxWait: 45000, timeout: 45000 },
    );
  }

  /**
   * Reactivates a deactivated account.
   */
  async reactivateAccount(
    adminScope: ScopeContext,
    targetUserId: string,
  ): Promise<void> {
    const target = await this.prisma.profile.findUnique({
      where: { id: targetUserId },
    });

    if (!target) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Account not found',
      });
    }

    if (getRoleRank(adminScope.role) <= getRoleRank(target.role)) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_RANK',
        message: 'Cannot reactivate an account with equal or higher rank',
      });
    }

    // CDC Secretary can only reactivate members in their own team (fail-closed if teamId is missing or doesn't match)
    if (adminScope.role === UserRole.cdc_secretary) {
      if (
        !adminScope.teamId ||
        !target.teamId ||
        target.teamId !== adminScope.teamId
      ) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: 'Cannot reactivate an account outside your team',
        });
      }
    }

    // SDA can only reactivate accounts in their DS division or accounts they created
    if (adminScope.role === UserRole.sda) {
      const isCreator = target.createdBy === adminScope.userId;
      const inScope = !!adminScope.dsId && target.dsId === adminScope.dsId;
      if (!isCreator && !inScope) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: 'Cannot reactivate an account outside your DS division',
        });
      }
    }

    // DC can only reactivate accounts in their district or accounts they created
    if (adminScope.role === UserRole.dc) {
      const isCreator = target.createdBy === adminScope.userId;
      const inScope =
        !!adminScope.districtId && target.districtId === adminScope.districtId;
      if (!isCreator && !inScope) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: 'Cannot reactivate an account outside your district',
        });
      }
    }

    await this.prisma.$transaction(
      async (tx) => {
        // Check team capacity if user belongs to a team
        if (target.role === UserRole.team_member && target.teamId) {
          await this.assertTeamCapacity(tx, target.teamId, 1);
        }

        await tx.profile.update({
          where: { id: targetUserId },
          data: {
            isActive: true,
            deactivatedAt: null,
            deactivatedBy: null,
          },
        });

        // Restore leader_id if reactivating a CDC secretary and the team has no current leader
        if (target.role === UserRole.cdc_secretary && target.teamId) {
          const team = await tx.team.findUnique({
            where: { id: target.teamId },
          });
          if (team && !team.leaderId) {
            await tx.team.update({
              where: { id: target.teamId },
              data: { leaderId: targetUserId },
            });
          }
        }

        await tx.accountAudit.create({
          data: {
            actorId: adminScope.userId,
            targetId: targetUserId,
            action: 'reactivated',
          },
        });
      },
      { maxWait: 45000, timeout: 45000 },
    );
  }

  /**
   * Reissues an initial password for an account (Decision C14 & C18, Blueprint §3.1).
   * Restricted to the original creator, active territorial admin of higher rank, or Level 00 super admin.
   */
  async reissuePassword(
    adminScope: ScopeContext,
    targetUserId: string,
  ): Promise<{ initialPassword: string; expiresAt: Date }> {
    const target = await this.prisma.profile.findUnique({
      where: { id: targetUserId },
    });

    if (!target) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Account not found',
      });
    }

    const isCreator = target.createdBy === adminScope.userId;
    const isSuperAdmin = adminScope.role === UserRole.super_admin;
    const isTerritorialAdmin =
      getRoleRank(adminScope.role) > getRoleRank(target.role) &&
      ((adminScope.role === UserRole.dc &&
        !!adminScope.districtId &&
        target.districtId === adminScope.districtId) ||
        (adminScope.role === UserRole.sda &&
          !!adminScope.dsId &&
          target.dsId === adminScope.dsId) ||
        (adminScope.role === UserRole.cdc_secretary &&
          !!adminScope.teamId &&
          target.teamId === adminScope.teamId) ||
        adminScope.role === UserRole.cg ||
        adminScope.role === UserRole.admin);

    if (!isCreator && !isSuperAdmin && !isTerritorialAdmin) {
      throw new ForbiddenException({
        code: 'REISSUE_FORBIDDEN',
        message:
          'Password reissue is restricted to the account creator, territorial admin, or Super Admin',
      });
    }

    const ttlMs =
      AccountService.INITIAL_PASSWORD_TTL_DAYS * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs);
    const { raw, display } = this.credentialService.generateInitialPassword();
    const passwordHash = await this.credentialService.hashInitialPassword(raw);

    await this.prisma.$transaction(
      async (tx) => {
        await tx.profile.update({
          where: { id: targetUserId },
          data: {
            passwordHash,
            mustChangePassword: true,
            passwordExpiresAt: expiresAt,
            tokenVersion: { increment: 1 },
          },
        });

        // Revoke existing refresh tokens
        await tx.refreshToken.deleteMany({
          where: { profileId: targetUserId },
        });

        await this.sessionActivityService?.endSessions(
          { profileId: targetUserId, reason: 'password_reset', all: true },
          tx,
        );

        await tx.accountAudit.create({
          data: {
            actorId: adminScope.userId,
            targetId: targetUserId,
            action: 'reissued',
          },
        });
      },
      { maxWait: 45000, timeout: 45000 },
    );

    return {
      initialPassword: display,
      expiresAt,
    };
  }

  /**
   * Updates account details for a subordinate account within scope (M1.4).
   */
  async updateAccount(
    adminScope: ScopeContext,
    targetUserId: string,
    dto: UpdateAccountDto,
  ) {
    const target = await this.prisma.profile.findUnique({
      where: { id: targetUserId },
    });
    if (!target) {
      throw new NotFoundException(`Account ${targetUserId} not found`);
    }

    // Role hierarchy check
    if (getRoleRank(adminScope.role) <= getRoleRank(target.role)) {
      throw new ForbiddenException(
        'Cannot modify account with equal or higher role rank',
      );
    }

    // Territorial scope check
    const canSee = this.scopeService.canSee(adminScope, {
      districtId: target.districtId || '',
      dsId: target.dsId || '',
      gnId: target.gnId || '',
      teamId: target.teamId || undefined,
      collectedBy: target.createdBy || '',
    });
    if (!canSee) {
      throw new ForbiddenException(
        'Account is outside caller territorial scope',
      );
    }

    // Validate new team territorial scope if changing team
    let newTeamGnId: string | undefined;
    let newTeamDsId: string | undefined;
    let newTeamDistrictId: string | undefined;

    if (dto.teamId && dto.teamId !== target.teamId) {
      const newTeam = await this.prisma.team.findUnique({
        where: { id: dto.teamId },
        include: {
          gn: {
            include: {
              ds: true,
            },
          },
        },
      });

      if (!newTeam) {
        throw new NotFoundException({
          code: 'TEAM_NOT_FOUND',
          message: 'Specified team does not exist',
        });
      }

      if (adminScope.role === UserRole.cdc_secretary) {
        if (dto.teamId !== adminScope.teamId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_TEAM',
            message: 'CDC Secretary can only assign accounts to their own team',
          });
        }
      } else if (adminScope.role === UserRole.sda) {
        if (adminScope.dsId && newTeam.gn.dsId !== adminScope.dsId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DS',
            message:
              'SDA cannot assign accounts to a team outside their DS division',
          });
        }
        if (
          adminScope.districtId &&
          newTeam.gn.ds.districtId !== adminScope.districtId
        ) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DISTRICT',
            message:
              'SDA cannot assign accounts to a team outside their district',
          });
        }
      } else if (adminScope.role === UserRole.dc) {
        if (
          adminScope.districtId &&
          newTeam.gn.ds.districtId !== adminScope.districtId
        ) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DISTRICT',
            message:
              'DC cannot assign accounts to a team outside their district',
          });
        }
      }

      newTeamGnId = newTeam.gnId;
      newTeamDsId = newTeam.gn.dsId;
      newTeamDistrictId = newTeam.gn.ds.districtId;
    }

    let normalizedPhoneE164: string | null | undefined = undefined;
    if (dto.phoneE164 !== undefined) {
      if (dto.phoneE164 && dto.phoneE164.trim().length > 0) {
        const pRes = GrsValidators.normalizePhone(dto.phoneE164);
        if (!pRes.isValid) {
          throw new BadRequestException({
            code: 'INVALID_PHONE_NUMBER',
            message: `Invalid phone number format: ${dto.phoneE164}`,
          });
        }
        normalizedPhoneE164 = pRes.value!;
      } else {
        normalizedPhoneE164 = null;
      }
    }

    return this.prisma.$transaction(
      async (tx) => {
        const willBeActive =
          dto.isActive !== undefined ? dto.isActive : target.isActive;
        const effectiveTeamId =
          dto.teamId !== undefined ? dto.teamId : target.teamId;
        const isTeamChanging =
          dto.teamId !== undefined && dto.teamId !== target.teamId;
        const isReactivating =
          dto.isActive === true && target.isActive === false;

        // Atomically lock the team and check member capacity inside the transaction (C8)
        if (
          target.role === UserRole.team_member &&
          effectiveTeamId &&
          willBeActive &&
          (isTeamChanging || isReactivating)
        ) {
          await this.assertTeamCapacity(tx, effectiveTeamId, 1);
        }

        const data: Prisma.ProfileUpdateInput = {
          fullName:
            dto.fullName !== undefined ? dto.fullName.trim() : undefined,
          phoneE164:
            normalizedPhoneE164 !== undefined ? normalizedPhoneE164 : undefined,
          teamId: dto.teamId !== undefined ? dto.teamId : undefined,
          isActive: dto.isActive ?? undefined,
          preferredLanguage: dto.preferredLanguage ?? undefined,
        };

        if (isTeamChanging && dto.teamId) {
          if (newTeamGnId) data.gnId = newTeamGnId;
          if (newTeamDsId) data.dsId = newTeamDsId;
          if (newTeamDistrictId) data.districtId = newTeamDistrictId;
        }

        if (dto.isActive === false && target.isActive === true) {
          data.deactivatedAt = new Date();
          data.deactivatedBy = adminScope.userId;
          data.tokenVersion = { increment: 1 };
        } else if (dto.isActive === true && target.isActive === false) {
          data.deactivatedAt = null;
          data.deactivatedBy = null;
        }

        const updated = await tx.profile.update({
          where: { id: targetUserId },
          data,
        });

        if (dto.isActive === false && target.isActive === true) {
          await tx.refreshToken.deleteMany({
            where: { profileId: targetUserId },
          });
          await this.sessionActivityService?.endSessions(
            { profileId: targetUserId, reason: 'deactivated', all: true },
            tx,
          );
        }

        await tx.accountAudit.create({
          data: {
            actorId: adminScope.userId,
            targetId: targetUserId,
            action: 'updated',
          },
        });

        return {
          id: updated.id,
          userCode: updated.userCode,
          fullName: updated.fullName,
          phoneE164: updated.phoneE164,
          preferredLanguage: updated.preferredLanguage,
          role: updated.role,
          teamId: updated.teamId,
          isActive: updated.isActive,
        };
      },
      { maxWait: 45000, timeout: 45000 },
    );
  }

  /**
   * Permanently deletes a subordinate account that has no field/administrative history.
   * Refuses with 409 Conflict if the user collected clients, created households/batches,
   * requested exports, assigned territories, or audited other accounts.
   */
  async deleteAccount(
    adminScope: ScopeContext,
    targetUserId: string,
  ): Promise<{ success: boolean; id: string }> {
    if (targetUserId === adminScope.userId) {
      throw new ForbiddenException({
        code: 'CANNOT_DELETE_SELF',
        message: 'Cannot delete your own account',
      });
    }

    await this.assertCanManageTargetProfile(adminScope, targetUserId, 'delete');

    const [
      clientsCount,
      householdsCount,
      batchesCount,
      exportsCount,
      assignedByCount,
      otherActorAuditsCount,
    ] = await Promise.all([
      this.prisma.client.count({
        where: {
          OR: [{ collectedBy: targetUserId }, { createdBy: targetUserId }],
        },
      }),
      this.prisma.household.count({
        where: {
          OR: [{ createdBy: targetUserId }, { finishedBy: targetUserId }],
        },
      }),
      this.prisma.accountBatch.count({ where: { createdBy: targetUserId } }),
      this.prisma.exportJob.count({ where: { requestedBy: targetUserId } }),
      this.prisma.accountAssignment.count({
        where: { assignedBy: targetUserId },
      }),
      this.prisma.accountAudit.count({
        where: { actorId: targetUserId, targetId: { not: targetUserId } },
      }),
    ]);

    if (
      clientsCount > 0 ||
      householdsCount > 0 ||
      batchesCount > 0 ||
      exportsCount > 0 ||
      assignedByCount > 0 ||
      otherActorAuditsCount > 0
    ) {
      throw new ConflictException({
        code: 'ACCOUNT_HAS_HISTORY',
        message:
          'Cannot delete account that has collected records, created households, batches, exports, assignments, or audit history. Deactivate the account instead.',
      });
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.team.updateMany({
          where: { leaderId: targetUserId },
          data: { leaderId: null },
        });
        await tx.gnDivision.updateMany({
          where: { cdcSecretaryId: targetUserId },
          data: { cdcSecretaryId: null },
        });
        await tx.accountAssignment.updateMany({
          where: { endedBy: targetUserId },
          data: { endedBy: null },
        });
        await tx.accountAudit.deleteMany({
          where: {
            OR: [{ targetId: targetUserId }, { actorId: targetUserId }],
          },
        });
        await tx.refreshToken.deleteMany({
          where: { profileId: targetUserId },
        });
        await tx.userSession.deleteMany({ where: { profileId: targetUserId } });
        await tx.emailCode.deleteMany({ where: { profileId: targetUserId } });
        await tx.profileAssignment.deleteMany({
          where: { profileId: targetUserId },
        });
        await tx.accountAssignment.deleteMany({
          where: { profileId: targetUserId },
        });
        await tx.profile.delete({ where: { id: targetUserId } });

        return { success: true, id: targetUserId };
      },
      { maxWait: 45000, timeout: 45000 },
    );
  }

  /**
   * Admin reset of subordinate password (alias of reissuePassword for M1.4 POST /accounts/:id/reset-password).
   */
  async resetPassword(adminScope: ScopeContext, targetUserId: string) {
    return this.reissuePassword(adminScope, targetUserId);
  }

  /**
   * Reissues passwords for all unactivated accounts in an account creation batch (M1.4).
   */
  async reissueBatch(adminScope: ScopeContext, batchId: string) {
    const batch = await this.prisma.accountBatch.findUnique({
      where: { id: batchId },
      include: { audits: true },
    });
    if (!batch) {
      throw new NotFoundException(`Account batch ${batchId} not found`);
    }

    const isCreator = batch.createdBy === adminScope.userId;
    const isSuperAdmin = adminScope.role === UserRole.super_admin;
    const isHigherRank =
      adminScope.role === UserRole.cg ||
      adminScope.role === UserRole.admin ||
      adminScope.role === UserRole.dc ||
      adminScope.role === UserRole.sda;

    if (!isCreator && !isSuperAdmin && !isHigherRank) {
      throw new ForbiddenException({
        code: 'REISSUE_FORBIDDEN',
        message:
          'Batch password reissue is restricted to the batch creator or superior admin',
      });
    }

    // Find accounts created under this batch that haven't changed password
    const auditTargets = await this.prisma.accountAudit.findMany({
      where: { batchId, action: 'created' },
      select: { targetId: true },
    });

    const targetIds = auditTargets.map((a) => a.targetId);
    const profiles = await this.prisma.profile.findMany({
      where: {
        id: { in: targetIds },
        isActive: true,
        mustChangePassword: true,
      },
    });

    const reissuedList: Array<{
      id: string;
      userCode: string;
      fullName: string;
      role: UserRole;
      initialPassword: string;
      passwordExpiresAt: Date;
    }> = [];

    const expiresAt = new Date();
    expiresAt.setDate(
      expiresAt.getDate() + AccountService.INITIAL_PASSWORD_TTL_DAYS,
    );

    for (const profile of profiles) {
      const { display, raw } = this.credentialService.generateInitialPassword();
      const passwordHash =
        await this.credentialService.hashInitialPassword(raw);

      await this.prisma.$transaction(
        async (tx) => {
          await tx.profile.update({
            where: { id: profile.id },
            data: {
              passwordHash,
              mustChangePassword: true,
              passwordExpiresAt: expiresAt,
              tokenVersion: { increment: 1 },
            },
          });

          await this.sessionActivityService?.endSessions(
            { profileId: profile.id, reason: 'password_reset', all: true },
            tx,
          );

          await tx.accountAudit.create({
            data: {
              actorId: adminScope.userId,
              targetId: profile.id,
              batchId,
              action: 'reissued',
            },
          });
        },
        { maxWait: 45000, timeout: 45000 },
      );

      reissuedList.push({
        id: profile.id,
        userCode: profile.userCode,
        fullName: profile.fullName,
        role: profile.role,
        initialPassword: display,
        passwordExpiresAt: expiresAt,
      });
    }

    return {
      batchId,
      role: batch.role,
      totalReissued: reissuedList.length,
      credentials: reissuedList,
    };
  }

  /**
   * Keyset paginated listing of accounts within caller scope.
   */
  async findAccounts(
    callerScope: ScopeContext,
    query: ListAccountsDto,
  ): Promise<{
    items: Array<{
      id: string;
      userCode: string;
      fullName: string;
      role: UserRole;
      phoneE164: string | null;
      preferredLanguage: string;
      teamId: string | null;
      gnId: string | null;
      isActive: boolean;
      createdAt: Date;
    }>;
    nextCursor?: string;
  }> {
    const take = Math.min(query.limit ?? query.take ?? 50, 100);

    // 1. Enforce territorial scope filter via ScopeService
    const scopeFilter = this.scopeService.getAccountScopeFilter(callerScope);

    // Guard against explicit cross-scope query widening
    if (callerScope.role === UserRole.cdc_secretary) {
      if (query.teamId && query.teamId !== callerScope.teamId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_SCOPE',
          message: 'Cannot access accounts outside assigned team',
        });
      }
    } else if (callerScope.role === UserRole.team_member) {
      if (query.teamId && query.teamId !== callerScope.teamId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_SCOPE',
          message: 'Cannot access accounts outside assigned scope',
        });
      }
    }

    // 2. Build caller query filters
    const userFilter: Prisma.ProfileWhereInput = {};
    if (query.role) userFilter.role = query.role;
    if (query.teamId) userFilter.teamId = query.teamId;
    if (query.gnId) userFilter.gnId = query.gnId;
    if (query.isActive !== undefined) userFilter.isActive = query.isActive;

    let searchFilter: Prisma.ProfileWhereInput | undefined;
    if (query.search) {
      searchFilter = {
        OR: [
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { userCode: { contains: query.search, mode: 'insensitive' } },
          { phoneE164: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const where = this.scopeService.combineConditions(
      scopeFilter,
      userFilter,
      searchFilter,
    );

    const items = await this.prisma.profile.findMany({
      where,
      take: take + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        userCode: true,
        fullName: true,
        role: true,
        phoneE164: true,
        preferredLanguage: true,
        teamId: true,
        gnId: true,
        isActive: true,
        createdAt: true,
      },
    });

    let nextCursor: string | undefined;
    if (items.length > take) {
      items.pop();
      nextCursor = items[items.length - 1]?.id;
    }

    return { items, nextCursor };
  }

  // --- Helpers ---

  private async assertCanCreate(
    creator: ScopeContext,
    targetRole: UserRole,
    targetDistrictId?: string,
    targetDsId?: string,
    targetGnId?: string,
    targetTeamId?: string,
  ): Promise<{
    districtId?: string;
    dsId?: string;
    gnId?: string;
    teamId?: string;
  }> {
    if (!canCreateRole(creator.role, targetRole)) {
      throw new ForbiddenException({
        code: 'CANNOT_CREATE_ROLE',
        message: `Role ${creator.role} is not permitted to create ${targetRole}`,
      });
    }

    // Bug 4: Fail closed everywhere. If creator is non-national, require their area scope.
    if (creator.role === UserRole.cdc_secretary) {
      if (!creator.teamId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_TEAM',
          message:
            'CDC Secretary must have an assigned team to create accounts',
        });
      }
    } else if (creator.role === UserRole.sda) {
      if (!creator.dsId || !creator.districtId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_DS',
          message:
            'SDA must have an assigned DS division and district to create accounts',
        });
      }
    } else if (creator.role === UserRole.dc) {
      if (!creator.districtId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_DISTRICT',
          message: 'DC must have an assigned district to create accounts',
        });
      }
    }

    const effectiveTeamId =
      targetTeamId ||
      (targetRole === UserRole.team_member
        ? creator.teamId || undefined
        : undefined);

    // Immediate role scope constraints (Fail closed: verify caller territory before validating completeness)
    if (creator.role === UserRole.cdc_secretary) {
      if (effectiveTeamId && effectiveTeamId !== creator.teamId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_TEAM',
          message: 'CDC Secretary can only create members for their own team',
        });
      }
      if (targetGnId && creator.gnId && targetGnId !== creator.gnId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_GN',
          message:
            'CDC Secretary can only create members in their own GN division',
        });
      }
      if (targetDsId && creator.dsId && targetDsId !== creator.dsId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_DS',
          message:
            'CDC Secretary can only create members in their own DS division',
        });
      }
      if (
        targetDistrictId &&
        creator.districtId &&
        targetDistrictId !== creator.districtId
      ) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_DISTRICT',
          message:
            'CDC Secretary can only create members in their own district',
        });
      }
    } else if (creator.role === UserRole.dc) {
      if (targetDistrictId && targetDistrictId !== creator.districtId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_DISTRICT',
          message: 'DC can only create accounts within their assigned district',
        });
      }
    } else if (creator.role === UserRole.sda) {
      if (targetDistrictId && targetDistrictId !== creator.districtId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_DISTRICT',
          message:
            'SDA can only create accounts within their assigned district',
        });
      }
      if (targetDsId && targetDsId !== creator.dsId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_DS',
          message:
            'SDA can only create accounts within their assigned DS division',
        });
      }
    }

    // Bug 3: Require the right area per role at creation for scoped roles
    // Super Admin / Admin (national creators) can create unassigned accounts when testing or pre-staging.
    const isNationalCreator =
      creator.role === UserRole.super_admin || creator.role === UserRole.admin;

    if (targetRole === UserRole.cdc_secretary) {
      if (!effectiveTeamId && !isNationalCreator) {
        throw new BadRequestException({
          code: 'TEAM_REQUIRED',
          message:
            'Team assignment is required for CDC secretary (team leader)',
        });
      }
    } else if (targetRole === UserRole.team_member) {
      if (!effectiveTeamId && !isNationalCreator) {
        throw new BadRequestException({
          code: 'TEAM_REQUIRED',
          message: 'Team assignment is required for team members',
        });
      }
    } else if (targetRole === UserRole.sda && !isNationalCreator) {
      const effectiveDsId = targetDsId || creator.dsId;
      const effectiveDistrictId = targetDistrictId || creator.districtId;
      if (!effectiveDsId || !effectiveDistrictId) {
        throw new BadRequestException({
          code: 'DS_REQUIRED',
          message: 'DS division and district assignment are required for SDA',
        });
      }
    } else if (targetRole === UserRole.dc && !isNationalCreator) {
      const effectiveDistrictId = targetDistrictId || creator.districtId;
      if (!effectiveDistrictId) {
        throw new BadRequestException({
          code: 'DISTRICT_REQUIRED',
          message: 'District assignment is required for DC',
        });
      }
    }

    if (effectiveTeamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: effectiveTeamId },
        include: {
          gn: {
            include: {
              ds: true,
            },
          },
        },
      });

      if (!team) {
        throw new NotFoundException({
          code: 'TEAM_NOT_FOUND',
          message: 'Specified team does not exist',
        });
      }

      // Check one-leader-per-team and one-secretary-per-GN rule (Decision C20)
      if (targetRole === UserRole.cdc_secretary) {
        if (team.leaderId) {
          const activeLeader = await this.prisma.profile.findFirst({
            where: { id: team.leaderId, isActive: true },
          });
          if (activeLeader) {
            throw new ConflictException({
              code: 'TEAM_ALREADY_HAS_LEADER',
              message: 'Team already has an active leader assigned',
            });
          }
        }

        const activeGnAssignment = this.prisma.profileAssignment
          ? await this.prisma.profileAssignment.findFirst({
            where: { gnId: team.gnId, validTo: null },
            include: { profile: true },
          })
          : null;
        if (activeGnAssignment && activeGnAssignment.profile?.isActive) {
          throw new ConflictException({
            code: 'GN_ALREADY_HAS_LEADER',
            message: 'GN division already has an active CDC secretary assigned',
          });
        }
      }

      // Check creator territory against team's territory
      if (creator.role === UserRole.dc) {
        if (
          !creator.districtId ||
          team.gn.ds.districtId !== creator.districtId
        ) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DISTRICT',
            message:
              'DC cannot create accounts for a team outside their assigned district',
          });
        }
      }

      if (creator.role === UserRole.sda) {
        if (
          !creator.districtId ||
          team.gn.ds.districtId !== creator.districtId
        ) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DISTRICT',
            message:
              'SDA cannot create accounts for a team outside their assigned district',
          });
        }
        if (!creator.dsId || team.gn.dsId !== creator.dsId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DS',
            message:
              'SDA cannot create accounts for a team outside their assigned DS division',
          });
        }
      }

      if (creator.role === UserRole.cdc_secretary) {
        if (!creator.teamId || team.id !== creator.teamId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_TEAM',
            message: 'CDC Secretary can only create members for their own team',
          });
        }
      }

      // Consistency checks: districtId and dsId and gnId must match the team
      if (targetDistrictId && targetDistrictId !== team.gn.ds.districtId) {
        throw new BadRequestException({
          code: 'TERRITORY_MISMATCH',
          message: 'Target district does not match the team district',
        });
      }
      if (targetDsId && targetDsId !== team.gn.dsId) {
        throw new BadRequestException({
          code: 'TERRITORY_MISMATCH',
          message: 'Target DS division does not match the team DS division',
        });
      }
      if (targetGnId && targetGnId !== team.gnId) {
        throw new BadRequestException({
          code: 'TERRITORY_MISMATCH',
          message: 'Target GN division does not match the team GN division',
        });
      }

      return {
        districtId:
          targetDistrictId ||
          team.gn.ds.districtId ||
          creator.districtId ||
          undefined,
        dsId: targetDsId || team.gn.dsId || creator.dsId || undefined,
        gnId: targetGnId || team.gnId || creator.gnId || undefined,
        teamId: effectiveTeamId,
      };
    }

    if (targetGnId) {
      const gn = await this.prisma.gnDivision.findUnique({
        where: { id: targetGnId },
        include: { ds: true },
      });

      if (!gn) {
        throw new NotFoundException({
          code: 'GN_NOT_FOUND',
          message: 'Specified GN division does not exist',
        });
      }

      if (creator.role === UserRole.dc) {
        if (!creator.districtId || gn.ds.districtId !== creator.districtId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DISTRICT',
            message:
              'DC cannot create accounts in a GN division outside their district',
          });
        }
      }

      if (creator.role === UserRole.sda) {
        if (!creator.districtId || gn.ds.districtId !== creator.districtId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DISTRICT',
            message: 'SDA cannot create accounts outside their district',
          });
        }
        if (!creator.dsId || gn.dsId !== creator.dsId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DS',
            message:
              'SDA cannot create accounts in a GN division outside their DS division',
          });
        }
      }

      if (targetDistrictId && targetDistrictId !== gn.ds.districtId) {
        throw new BadRequestException({
          code: 'TERRITORY_MISMATCH',
          message: 'Target district does not match the GN division',
        });
      }
      if (targetDsId && targetDsId !== gn.dsId) {
        throw new BadRequestException({
          code: 'TERRITORY_MISMATCH',
          message: 'Target DS division does not match the GN division',
        });
      }

      return {
        districtId:
          targetDistrictId ||
          gn.ds.districtId ||
          creator.districtId ||
          undefined,
        dsId: targetDsId || gn.dsId || creator.dsId || undefined,
        gnId: targetGnId,
        teamId: undefined,
      };
    }

    if (targetDsId) {
      const ds = await this.prisma.divisionalSecretariat.findUnique({
        where: { id: targetDsId },
      });

      if (!ds) {
        throw new NotFoundException({
          code: 'DS_NOT_FOUND',
          message: 'Specified DS division does not exist',
        });
      }

      if (creator.role === UserRole.dc) {
        if (!creator.districtId || ds.districtId !== creator.districtId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DISTRICT',
            message:
              'DC cannot create accounts in a DS division outside their district',
          });
        }
      }

      if (creator.role === UserRole.sda) {
        if (!creator.districtId || ds.districtId !== creator.districtId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DISTRICT',
            message: 'SDA cannot create accounts outside their district',
          });
        }
        if (!creator.dsId || ds.id !== creator.dsId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DS',
            message: 'SDA cannot create accounts outside their DS division',
          });
        }
      }

      if (targetDistrictId && targetDistrictId !== ds.districtId) {
        throw new BadRequestException({
          code: 'TERRITORY_MISMATCH',
          message: 'Target district does not match the DS division',
        });
      }

      return {
        districtId:
          targetDistrictId || ds.districtId || creator.districtId || undefined,
        dsId: targetDsId,
        gnId: undefined,
        teamId: undefined,
      };
    }

    if (targetDistrictId) {
      if (
        creator.role === UserRole.dc &&
        (!creator.districtId || targetDistrictId !== creator.districtId)
      ) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_DISTRICT',
          message: 'DC cannot create accounts outside their assigned district',
        });
      }
      if (
        creator.role === UserRole.sda &&
        (!creator.districtId || targetDistrictId !== creator.districtId)
      ) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_DISTRICT',
          message: 'SDA cannot create accounts outside their assigned district',
        });
      }

      return {
        districtId: targetDistrictId,
        dsId: creator.dsId || undefined,
        gnId: creator.gnId || undefined,
        teamId: undefined,
      };
    }

    return {
      districtId: creator.districtId || undefined,
      dsId: creator.dsId || undefined,
      gnId: creator.gnId || undefined,
      teamId: effectiveTeamId,
    };
  }

  /**
   * Atomically locks the team row and checks member capacity (Decision C8).
   * Note / Decision (Bug 5): `max_members` specifically limits the count of active
   * field enumerators/agents (`team_member`, Level 5) assigned to the team.
   * The Level 4 team leader (`cdc_secretary`) is the team coordinator/supervisor and does not
   * count against enumerator capacity (e.g. a team limit of 10 permits 10 field agents).
   * Throws ConflictException with detailed slot count if exceeded.
   */
  private async assertTeamCapacity(
    tx: Prisma.TransactionClient,
    teamId: string,
    requestedCount: number,
  ): Promise<string> {
    const teams = await tx.$queryRaw<
      Array<{ id: string; max_members: number; gn_id: string }>
    >`
      SELECT id, max_members, gn_id FROM teams WHERE id = ${teamId}::uuid FOR UPDATE
    `;

    if (!teams || teams.length === 0) {
      throw new NotFoundException({
        code: 'TEAM_NOT_FOUND',
        message: 'Specified team does not exist',
      });
    }

    const team = teams[0];
    const activeCount = await tx.profile.count({
      where: {
        teamId,
        role: UserRole.team_member,
        isActive: true,
      },
    });

    const availableSlots = Math.max(0, team.max_members - activeCount);

    if (requestedCount > availableSlots) {
      throw new ConflictException({
        code: 'TEAM_MEMBER_LIMIT_EXCEEDED',
        message: `Team member limit exceeded. Available slots: ${availableSlots}, requested: ${requestedCount}`,
        teamId,
        maxMembers: team.max_members,
        currentMembers: activeCount,
        availableSlots,
        requestedCount,
      });
    }

    return team.gn_id;
  }

  private formatRoleName(role: UserRole): string {
    switch (role) {
      case UserRole.cdc_secretary:
        return 'CDC Secretary';
      case UserRole.team_member:
        return 'Team Member';
      case UserRole.sda:
        return 'SDA';
      case UserRole.dc:
        return 'DC';
      case UserRole.cg:
        return 'CG';
      case UserRole.admin:
        return 'Admin';
      case UserRole.super_admin:
        return 'Super Admin';
      default:
        return 'User';
    }
  }

  private async generateUniqueUserCode(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    return this.credentialService.generateUserCode();
  }

  /**
   * Assigns a CDC Secretary to a GN Division (multi-GN assignment or handover per Decision C20).
   * Enforces the database constraint of one active secretary per GN division.
   * On handover: marks existing active assignment as valid_to = now() and bumps token_version on old holder.
   */
  async assignSecretaryToGn(
    actorScope: ScopeContext,
    profileId: string,
    gnId: string,
    teamId?: string,
  ) {
    if (
      actorScope.role !== UserRole.super_admin &&
      actorScope.role !== UserRole.admin &&
      actorScope.role !== UserRole.dc &&
      actorScope.role !== UserRole.sda
    ) {
      throw new ForbiddenException({
        code: 'CANNOT_ASSIGN_AREA',
        message:
          'You do not have permission to assign CDC secretaries to GN divisions',
      });
    }

    const targetProfile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });

    if (
      !targetProfile ||
      targetProfile.role !== UserRole.cdc_secretary ||
      !targetProfile.isActive
    ) {
      throw new BadRequestException({
        code: 'INVALID_TARGET_PROFILE',
        message: 'Target user must be an active CDC secretary',
      });
    }

    const gn = await this.prisma.gnDivision.findUnique({
      where: { id: gnId },
      include: { ds: true },
    });

    if (!gn) {
      throw new NotFoundException({
        code: 'GN_NOT_FOUND',
        message: 'Specified GN division does not exist',
      });
    }

    if (
      actorScope.role === UserRole.dc &&
      gn.ds.districtId !== actorScope.districtId
    ) {
      throw new ForbiddenException({
        code: 'OUT_OF_SCOPE_DISTRICT',
        message: 'Cannot assign GN division outside your assigned district',
      });
    }
    if (actorScope.role === UserRole.sda && gn.dsId !== actorScope.dsId) {
      throw new ForbiddenException({
        code: 'OUT_OF_SCOPE_DS',
        message: 'Cannot assign GN division outside your assigned DS division',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const existingActive = await tx.profileAssignment.findFirst({
        where: { gnId, validTo: null },
      });

      if (existingActive) {
        if (existingActive.profileId === profileId) {
          return existingActive;
        }

        const now = new Date();
        await tx.profileAssignment.update({
          where: { id: existingActive.id },
          data: { validTo: now },
        });

        await tx.profile.update({
          where: { id: existingActive.profileId },
          data: { tokenVersion: { increment: 1 } },
        });

        await tx.refreshToken.updateMany({
          where: { profileId: existingActive.profileId, revokedAt: null },
          data: { revokedAt: now },
        });

        await this.sessionActivityService?.endSessions(
          {
            profileId: existingActive.profileId,
            reason: 'superseded',
            all: true,
            now,
          },
          tx,
        );
      }

      const newAssignment = await tx.profileAssignment.create({
        data: {
          profileId,
          gnId,
          teamId,
          validFrom: new Date(),
        },
      });

      if (teamId) {
        await tx.team.update({
          where: { id: teamId },
          data: { leaderId: profileId },
        });
      }

      await tx.accountAudit.create({
        data: {
          actorId: actorScope.userId,
          targetId: profileId,
          action: 'gn_assigned',
        },
      });

      return newAssignment;
    });
  }
}
