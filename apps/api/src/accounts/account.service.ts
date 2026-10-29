import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialService } from '../auth/credential.service';
import { ScopeService } from '../common/scope/scope.service';
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
          const userCode = await this.generateUniqueUserCode(tx);
          try {
            profile = await tx.profile.create({
              data: {
                userCode,
                fullName: dto.fullName,
                role: dto.role,
                passwordHash,
                phoneE164: dto.phoneE164,
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
              err?.code === 'P2002' &&
              (err?.meta?.target?.includes('userCode') ||
                err?.meta?.target?.includes('user_code') ||
                JSON.stringify(err?.meta || '').includes('userCode'));
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
    const resolvedTerritory = await this.assertCanCreate(
      creatorScope,
      dto.role,
      dto.districtId,
      dto.dsId,
      dto.gnId,
      dto.teamId,
    );

    const count = dto.count;
    if (count < 1 || count > 100) {
      throw new BadRequestException({
        code: 'INVALID_COUNT',
        message: 'Bulk account creation must be between 1 and 100 accounts',
      });
    }

    const ttlMs =
      AccountService.INITIAL_PASSWORD_TTL_DAYS * 24 * 60 * 60 * 1000;
    const passwordExpiresAt = new Date(Date.now() + ttlMs);

    // Pre-generate credentials outside transaction to minimize lock holding time
    const pregeneratedMembers = [];
    for (let i = 0; i < count; i++) {
      const memberInfo = dto.members && dto.members[i];
      const fullName = memberInfo?.fullName || `Team Member ${i + 1}`;
      const phoneE164 = memberInfo?.phoneE164;
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
            const userCode = await this.generateUniqueUserCode(tx);
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
                err?.code === 'P2002' &&
                (err?.meta?.target?.includes('userCode') ||
                  err?.meta?.target?.includes('user_code') ||
                  JSON.stringify(err?.meta || '').includes('userCode'));
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

        return {
          batchId: batch.id,
          users: results,
        };
      },
      { maxWait: 45000, timeout: 45000 },
    );
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
        message: 'Cannot deactivate an account with equal or higher rank',
      });
    }

    // CDC Secretary can only deactivate members in their own team
    if (
      adminScope.role === UserRole.cdc_secretary &&
      target.teamId !== adminScope.teamId
    ) {
      throw new ForbiddenException({
        code: 'OUT_OF_SCOPE',
        message: 'Cannot deactivate an account outside your team',
      });
    }

    await this.prisma.$transaction(async (tx) => {
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

      await tx.accountAudit.create({
        data: {
          actorId: adminScope.userId,
          targetId: targetUserId,
          action: 'deactivated',
        },
      });
    }, { maxWait: 45000, timeout: 45000 });
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

    if (
      adminScope.role === UserRole.cdc_secretary &&
      target.teamId !== adminScope.teamId
    ) {
      throw new ForbiddenException({
        code: 'OUT_OF_SCOPE',
        message: 'Cannot reactivate an account outside your team',
      });
    }

    await this.prisma.$transaction(async (tx) => {
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

      await tx.accountAudit.create({
        data: {
          actorId: adminScope.userId,
          targetId: targetUserId,
          action: 'reactivated',
        },
      });
    }, { maxWait: 45000, timeout: 45000 });
  }

  /**
   * Reissues an initial password for an account (Decision C14 & C18).
   * Restricted to the original creator or Level 00 super admin.
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

    if (!isCreator && !isSuperAdmin) {
      throw new ForbiddenException({
        code: 'REISSUE_FORBIDDEN',
        message:
          'Password reissue is restricted to the account creator or Super Admin',
      });
    }

    const ttlMs =
      AccountService.INITIAL_PASSWORD_TTL_DAYS * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs);
    const { raw, display } = this.credentialService.generateInitialPassword();
    const passwordHash = await this.credentialService.hashInitialPassword(raw);

    await this.prisma.$transaction(async (tx) => {
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

      await tx.accountAudit.create({
        data: {
          actorId: adminScope.userId,
          targetId: targetUserId,
          action: 'reissued',
        },
      });
    }, { maxWait: 45000, timeout: 45000 });

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
          fullName: dto.fullName ?? undefined,
          phoneE164: dto.phoneE164 ?? undefined,
          teamId: dto.teamId !== undefined ? dto.teamId : undefined,
          isActive: dto.isActive ?? undefined,
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
          role: updated.role,
          teamId: updated.teamId,
          isActive: updated.isActive,
        };
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
      initialPassword: string;
      passwordExpiresAt: Date;
    }> = [];

    const expiresAt = new Date();
    expiresAt.setDate(
      expiresAt.getDate() + AccountService.INITIAL_PASSWORD_TTL_DAYS,
    );

    for (const profile of profiles) {
      const { display, raw } =
        this.credentialService.generateInitialPassword();
      const passwordHash =
        await this.credentialService.hashInitialPassword(raw);

      await this.prisma.$transaction(async (tx) => {
        await tx.profile.update({
          where: { id: profile.id },
          data: {
            passwordHash,
            mustChangePassword: true,
            passwordExpiresAt: expiresAt,
            tokenVersion: { increment: 1 },
          },
        });

        await tx.accountAudit.create({
          data: {
            actorId: adminScope.userId,
            targetId: profile.id,
            batchId,
            action: 'reissued',
          },
        });
      }, { maxWait: 45000, timeout: 45000 });

      reissuedList.push({
        id: profile.id,
        userCode: profile.userCode,
        fullName: profile.fullName,
        initialPassword: display,
        passwordExpiresAt: expiresAt,
      });
    }

    return {
      batchId,
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
    const take = Math.min(query.take || 50, 100);
    const where: Prisma.ProfileWhereInput = {};

    // Territorial scope filtering
    if (callerScope.role === UserRole.cdc_secretary) {
      where.teamId = callerScope.teamId || undefined;
    } else if (callerScope.role === UserRole.team_member) {
      where.id = callerScope.userId;
    } else if (callerScope.gnId) {
      where.gnId = callerScope.gnId;
    } else if (callerScope.dsId) {
      where.dsId = callerScope.dsId;
    } else if (callerScope.districtId) {
      where.districtId = callerScope.districtId;
    }

    if (query.role) where.role = query.role;
    if (query.teamId) where.teamId = query.teamId;
    if (query.gnId) where.gnId = query.gnId;
    if (query.isActive !== undefined) where.isActive = query.isActive;

    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { userCode: { contains: query.search, mode: 'insensitive' } },
        { phoneE164: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const items = await this.prisma.profile.findMany({
      where,
      take: take + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' },
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
      const nextItem = items.pop();
      nextCursor = nextItem?.id;
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

    const effectiveTeamId =
      targetTeamId ||
      (targetRole === UserRole.team_member
        ? creator.teamId || undefined
        : undefined);

    // Immediate role scope constraints
    if (creator.role === UserRole.cdc_secretary) {
      if (
        effectiveTeamId &&
        creator.teamId &&
        effectiveTeamId !== creator.teamId
      ) {
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
      if (
        targetDistrictId &&
        creator.districtId &&
        targetDistrictId !== creator.districtId
      ) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_DISTRICT',
          message:
            'DC can only create accounts within their assigned district',
        });
      }
    } else if (creator.role === UserRole.sda) {
      if (
        targetDistrictId &&
        creator.districtId &&
        targetDistrictId !== creator.districtId
      ) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_DISTRICT',
          message:
            'SDA can only create accounts within their assigned district',
        });
      }
      if (targetDsId && creator.dsId && targetDsId !== creator.dsId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_DS',
          message:
            'SDA can only create accounts within their assigned DS division',
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

      // Check creator territory against team's territory
      if (creator.role === UserRole.dc && creator.districtId) {
        if (team.gn.ds.districtId !== creator.districtId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DISTRICT',
            message:
              'DC cannot create accounts for a team outside their assigned district',
          });
        }
      }

      if (creator.role === UserRole.sda) {
        if (
          creator.districtId &&
          team.gn.ds.districtId !== creator.districtId
        ) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DISTRICT',
            message:
              'SDA cannot create accounts for a team outside their assigned district',
          });
        }
        if (creator.dsId && team.gn.dsId !== creator.dsId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DS',
            message:
              'SDA cannot create accounts for a team outside their assigned DS division',
          });
        }
      }

      if (creator.role === UserRole.cdc_secretary && creator.teamId) {
        if (team.id !== creator.teamId) {
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

      if (creator.role === UserRole.dc && creator.districtId) {
        if (gn.ds.districtId !== creator.districtId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DISTRICT',
            message:
              'DC cannot create accounts in a GN division outside their district',
          });
        }
      }

      if (creator.role === UserRole.sda) {
        if (creator.districtId && gn.ds.districtId !== creator.districtId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DISTRICT',
            message: 'SDA cannot create accounts outside their district',
          });
        }
        if (creator.dsId && gn.dsId !== creator.dsId) {
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

      if (creator.role === UserRole.dc && creator.districtId) {
        if (ds.districtId !== creator.districtId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DISTRICT',
            message:
              'DC cannot create accounts in a DS division outside their district',
          });
        }
      }

      if (creator.role === UserRole.sda) {
        if (creator.districtId && ds.districtId !== creator.districtId) {
          throw new ForbiddenException({
            code: 'OUT_OF_SCOPE_DISTRICT',
            message: 'SDA cannot create accounts outside their district',
          });
        }
        if (creator.dsId && ds.id !== creator.dsId) {
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
        creator.districtId &&
        targetDistrictId !== creator.districtId
      ) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_DISTRICT',
          message:
            'DC cannot create accounts outside their assigned district',
        });
      }
      if (
        creator.role === UserRole.sda &&
        creator.districtId &&
        targetDistrictId !== creator.districtId
      ) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_DISTRICT',
          message:
            'SDA cannot create accounts outside their assigned district',
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

  private async generateUniqueUserCode(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    for (let attempts = 0; attempts < 10; attempts++) {
      const code = this.credentialService.generateUserCode();
      const existing = await tx.profile.findUnique({
        where: { userCode: code },
        select: { id: true },
      });
      if (!existing) {
        return code;
      }
    }
    throw new ConflictException({
      code: 'USER_CODE_GENERATION_FAILED',
      message: 'Failed to generate unique user code after multiple attempts',
    });
  }
}
