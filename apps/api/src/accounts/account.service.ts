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
    this.assertCanCreate(creatorScope, dto.role, dto.teamId, dto.gnId);

    const ttlMs =
      AccountService.INITIAL_PASSWORD_TTL_DAYS * 24 * 60 * 60 * 1000;
    const passwordExpiresAt = new Date(Date.now() + ttlMs);

    const created = await this.prisma.$transaction(async (tx) => {
      let teamGnId: string | undefined;

      // Atomic team member limit enforcement (C8)
      if (dto.role === UserRole.team_member && dto.teamId) {
        teamGnId = await this.assertTeamCapacity(tx, dto.teamId, 1);
      }

      const gnId = dto.gnId || teamGnId || creatorScope.gnId || undefined;
      const userCode = await this.generateUniqueUserCode(tx);
      const { raw, display } =
        this.credentialService.generateInitialPassword();
      const passwordHash =
        await this.credentialService.hashInitialPassword(raw);

      const profile = await tx.profile.create({
        data: {
          userCode,
          fullName: dto.fullName,
          role: dto.role,
          passwordHash,
          phoneE164: dto.phoneE164,
          preferredLanguage: dto.preferredLanguage || 'si',
          districtId: dto.districtId || creatorScope.districtId || undefined,
          dsId: dto.dsId || creatorScope.dsId || undefined,
          gnId,
          teamId: dto.teamId || creatorScope.teamId || undefined,
          createdBy: creatorScope.userId,
          mustChangePassword: true,
          passwordExpiresAt,
          isActive: true,
        },
      });

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
    });

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
    this.assertCanCreate(creatorScope, dto.role, dto.teamId, dto.gnId);

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

    return this.prisma.$transaction(async (tx) => {
      let teamGnId: string | undefined;

      // Atomic team member limit enforcement (C8)
      if (dto.role === UserRole.team_member && dto.teamId) {
        teamGnId = await this.assertTeamCapacity(tx, dto.teamId, count);
      }

      const gnId = dto.gnId || teamGnId || creatorScope.gnId || undefined;

      const batch = await tx.accountBatch.create({
        data: {
          createdBy: creatorScope.userId,
          role: dto.role,
          teamId: dto.teamId || creatorScope.teamId || undefined,
          count,
        },
      });

      const results: CreatedAccountResponse[] = [];

      for (let i = 0; i < count; i++) {
        const memberInfo = dto.members && dto.members[i];
        const fullName =
          memberInfo?.fullName ||
          `Team Member ${i + 1}`;
        const phoneE164 = memberInfo?.phoneE164;
        const preferredLanguage = memberInfo?.preferredLanguage || 'si';

        const userCode = await this.generateUniqueUserCode(tx);
        const { raw, display } =
          this.credentialService.generateInitialPassword();
        const passwordHash =
          await this.credentialService.hashInitialPassword(raw);

        const profile = await tx.profile.create({
          data: {
            userCode,
            fullName,
            role: dto.role,
            passwordHash,
            phoneE164,
            preferredLanguage,
            districtId: dto.districtId || creatorScope.districtId || undefined,
            dsId: dto.dsId || creatorScope.dsId || undefined,
            gnId,
            teamId: dto.teamId || creatorScope.teamId || undefined,
            createdBy: creatorScope.userId,
            mustChangePassword: true,
            passwordExpiresAt,
            isActive: true,
          },
        });

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
          initialPassword: display,
          passwordExpiresAt,
        });
      }

      return {
        batchId: batch.id,
        users: results,
      };
    });
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
    });
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
    });
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
        message: 'Password reissue is restricted to the account creator or Super Admin',
      });
    }

    const ttlMs =
      AccountService.INITIAL_PASSWORD_TTL_DAYS * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs);
    const { raw, display } = this.credentialService.generateInitialPassword();
    const passwordHash =
      await this.credentialService.hashInitialPassword(raw);

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
    });

    return {
      initialPassword: display,
      expiresAt,
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

  private assertCanCreate(
    creator: ScopeContext,
    targetRole: UserRole,
    targetTeamId?: string,
    targetGnId?: string,
  ): void {
    if (!canCreateRole(creator.role, targetRole)) {
      throw new ForbiddenException({
        code: 'CANNOT_CREATE_ROLE',
        message: `Role ${creator.role} is not permitted to create ${targetRole}`,
      });
    }

    // CDC Secretary scope constraints
    if (creator.role === UserRole.cdc_secretary) {
      if (targetTeamId && targetTeamId !== creator.teamId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_TEAM',
          message: 'CDC Secretary can only create members for their own team',
        });
      }
      if (targetGnId && targetGnId !== creator.gnId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_GN',
          message: 'CDC Secretary can only create members in their own GN division',
        });
      }
    }
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
    const teams = await tx.$queryRaw<Array<{ id: string; max_members: number; gn_id: string }>>`
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
