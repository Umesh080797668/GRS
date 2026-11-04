import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from './scope.service';
import { ScopeContext } from './scope.types';
import { Household, Client, Prisma } from '@prisma/client';

export interface KeysetPaginationParams {
  cursor?: string;
  take?: number;
  search?: string;
}

@Injectable()
export class ScopedRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: ScopeService,
  ) {}

  /**
   * Finds households strictly within the caller's territory (Invariant 4).
   * Uses keyset pagination (Invariant 16) - never OFFSET.
   */
  async findHouseholds(
    scope: ScopeContext,
    params: KeysetPaginationParams & { status?: string },
  ): Promise<{ items: Household[]; nextCursor?: string }> {
    const scopeFilter = this.scopeService.getHouseholdScopeFilter(scope);
    const take = Math.min(Number(params.take) || 50, 100);

    const where: Prisma.HouseholdWhereInput = {
      ...scopeFilter,
    };

    if (params.search && typeof params.search === 'string') {
      const searchStr = params.search.trim();
      where.OR = [
        { houseNo: { contains: searchStr, mode: 'insensitive' } },
        { houseLeaderName: { contains: searchStr, mode: 'insensitive' } },
        { address: { contains: searchStr, mode: 'insensitive' } },
      ];
    }

    const cursorId =
      params.cursor && typeof params.cursor === 'string'
        ? params.cursor.trim()
        : undefined;

    const items = await this.prisma.household.findMany({
      where,
      take: take + 1,
      cursor: cursorId ? { id: cursorId } : undefined,
      skip: cursorId ? 1 : 0,
      orderBy: { createdAt: 'desc' },
    });

    let nextCursor: string | undefined;
    if (items.length > take) {
      items.pop();
      nextCursor = items[items.length - 1]?.id;
    }

    return { items, nextCursor };
  }

  /**
   * Finds a single household by ID, asserting area scope.
   */
  async findHouseholdById(scope: ScopeContext, id: string): Promise<Household> {
    if (typeof id !== 'string' || !id.trim()) {
      throw new BadRequestException({
        code: 'INVALID_ID',
        message_key: 'errors.household.invalid_id',
      });
    }
    const cleanId = id.trim();
    const scopeFilter = this.scopeService.getHouseholdScopeFilter(scope);

    const household = await this.prisma.household.findFirst({
      where: {
        id: { equals: cleanId },
        ...scopeFilter,
      },
    });

    if (!household) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message_key: 'errors.household.not_found',
      });
    }

    return household;
  }

  /**
   * Finds clients strictly within the caller's authorized scope.
   * Level 5 (team_member) only sees own entries.
   * Keyset pagination only.
   */
  async findClients(
    scope: ScopeContext,
    params: KeysetPaginationParams & { householdId?: string },
  ): Promise<{ items: Client[]; nextCursor?: string }> {
    const scopeFilter = this.scopeService.getClientScopeFilter(scope);
    const take = Math.min(Number(params.take) || 50, 100);

    const householdId =
      params.householdId && typeof params.householdId === 'string'
        ? params.householdId.trim()
        : undefined;

    const where: Prisma.ClientWhereInput = {
      ...scopeFilter,
      householdId: householdId ? { equals: householdId } : undefined,
    };

    if (params.search && typeof params.search === 'string') {
      where.name = { contains: params.search.trim(), mode: 'insensitive' };
    }

    const cursorId =
      params.cursor && typeof params.cursor === 'string'
        ? params.cursor.trim()
        : undefined;

    const items = await this.prisma.client.findMany({
      where,
      take: take + 1,
      cursor: cursorId ? { id: cursorId } : undefined,
      skip: cursorId ? 1 : 0,
      orderBy: { createdAt: 'desc' },
    });

    let nextCursor: string | undefined;
    if (items.length > take) {
      items.pop();
      nextCursor = items[items.length - 1]?.id;
    }

    return { items, nextCursor };
  }

  /**
   * Finds a client by ID within authorized scope.
   */
  async findClientById(scope: ScopeContext, id: string): Promise<Client> {
    if (typeof id !== 'string' || !id.trim()) {
      throw new BadRequestException({
        code: 'INVALID_ID',
        message_key: 'errors.client.invalid_id',
      });
    }
    const cleanId = id.trim();
    const scopeFilter = this.scopeService.getClientScopeFilter(scope);

    const client = await this.prisma.client.findFirst({
      where: {
        id: { equals: cleanId },
        ...scopeFilter,
      },
    });

    if (!client) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message_key: 'errors.client.not_found',
      });
    }

    return client;
  }

  /**
   * Corrects a synced client record.
   * Enforces Decision C2 & C13: Level 5 cannot edit synced records.
   * Writes audit record in client_audit.
   */
  async updateSyncedClient(
    scope: ScopeContext,
    id: string,
    data: Prisma.ClientUpdateInput,
    reason?: string,
  ): Promise<Client> {
    if (typeof id !== 'string' || !id.trim()) {
      throw new BadRequestException({
        code: 'INVALID_ID',
        message_key: 'errors.client.invalid_id',
      });
    }
    const cleanId = id.trim();
    const existing = await this.findClientById(scope, cleanId);

    // Assert edit permission for synced records
    if (!this.scopeService.canEditSyncedClient(scope, existing)) {
      throw new ForbiddenException({
        code: 'RECORD_LOCKED',
        message_key: 'errors.client.locked',
      });
    }

    // Atomic update and audit trail creation
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.client.update({
        where: { id: cleanId },
        data: {
          ...data,
          serverVersion: { increment: 1 },
          updatedBy: scope.userId,
        },
      });

      await tx.clientAudit.create({
        data: {
          clientId: cleanId,
          changedBy: scope.userId,
          before: existing as any,
          after: updated as any,
          reason,
        },
      });

      return updated;
    });
  }

  /**
   * Race-safe team house assignment per Section 8.4.
   * All-or-nothing; aborts with ConflictException (409) listing taken houses.
   */
  async assignHousesToTeam(
    scope: ScopeContext,
    teamId: string,
    houseIds: string[],
  ): Promise<void> {
    if (typeof teamId !== 'string' || !teamId.trim()) {
      throw new BadRequestException({
        code: 'INVALID_TEAM_ID',
        message_key: 'errors.team.invalid_id',
      });
    }
    const cleanTeamId = teamId.trim();

    if (!Array.isArray(houseIds)) {
      throw new BadRequestException({
        code: 'INVALID_HOUSE_IDS',
        message_key: 'errors.household.invalid_ids',
      });
    }
    const cleanHouseIds = houseIds
      .filter((h) => typeof h === 'string' && h.trim().length > 0)
      .map((h) => h.trim());

    const gnId = scope.gnId;
    if (!gnId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_SCOPE',
        message_key: 'errors.scope.missing_gn',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // Find any houses from the requested list that are already taken or belong to another GN
      const conflicting = await tx.household.findMany({
        where: {
          id: { in: cleanHouseIds },
          OR: [
            { teamId: { not: null } },
            { gnId: { not: gnId } },
            { deletedAt: { not: null } },
          ],
        },
        select: { id: true, houseNo: true, teamId: true },
      });

      if (conflicting.length > 0) {
        throw new ConflictException({
          code: 'HOUSE_TAKEN',
          message_key: 'errors.household.already_assigned',
          details: { conflicting },
        });
      }

      // Assign all requested houses atomically
      await tx.household.updateMany({
        where: {
          id: { in: cleanHouseIds },
          gnId,
          teamId: null,
          deletedAt: null,
        },
        data: {
          teamId: cleanTeamId,
          version: { increment: 1 },
          updatedBy: scope.userId,
        },
      });
    });
  }
}
