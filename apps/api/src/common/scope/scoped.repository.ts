import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
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
  ) { }

  /**
   * Finds households strictly within the caller's territory (Invariant 4).
   * Uses keyset pagination (Invariant 16) - never OFFSET.
   */
  async findHouseholds(
    scope: ScopeContext,
    params: KeysetPaginationParams & { status?: string },
  ): Promise<{ items: Household[]; nextCursor?: string }> {
    const scopeFilter = this.scopeService.getHouseholdScopeFilter(scope);
    const take = Math.min(params.take || 50, 100);

    const where: Prisma.HouseholdWhereInput = {
      ...scopeFilter,
    };

    if (params.search) {
      where.OR = [
        { houseNo: { contains: params.search, mode: 'insensitive' } },
        { houseLeaderName: { contains: params.search, mode: 'insensitive' } },
        { address: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const items = await this.prisma.household.findMany({
      where,
      take: take + 1,
      cursor: params.cursor ? { id: params.cursor } : undefined,
      skip: params.cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' },
    });

    let nextCursor: string | undefined;
    if (items.length > take) {
      const nextItem = items.pop();
      nextCursor = nextItem?.id;
    }

    return { items, nextCursor };
  }

  /**
   * Finds a single household by ID, asserting area scope.
   */
  async findHouseholdById(scope: ScopeContext, id: string): Promise<Household> {
    const scopeFilter = this.scopeService.getHouseholdScopeFilter(scope);

    const household = await this.prisma.household.findFirst({
      where: {
        id,
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
    const take = Math.min(params.take || 50, 100);

    const where: Prisma.ClientWhereInput = {
      ...scopeFilter,
      householdId: params.householdId,
    };

    if (params.search) {
      where.name = { contains: params.search, mode: 'insensitive' };
    }

    const items = await this.prisma.client.findMany({
      where,
      take: take + 1,
      cursor: params.cursor ? { id: params.cursor } : undefined,
      skip: params.cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' },
    });

    let nextCursor: string | undefined;
    if (items.length > take) {
      const nextItem = items.pop();
      nextCursor = nextItem?.id;
    }

    return { items, nextCursor };
  }

  /**
   * Finds a client by ID within authorized scope.
   */
  async findClientById(scope: ScopeContext, id: string): Promise<Client> {
    const scopeFilter = this.scopeService.getClientScopeFilter(scope);

    const client = await this.prisma.client.findFirst({
      where: {
        id,
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
    const existing = await this.findClientById(scope, id);

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
        where: { id },
        data: {
          ...data,
          serverVersion: { increment: 1 },
          updatedBy: scope.userId,
        },
      });

      await tx.clientAudit.create({
        data: {
          clientId: id,
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
          id: { in: houseIds },
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
          id: { in: houseIds },
          gnId,
          teamId: null,
          deletedAt: null,
        },
        data: {
          teamId,
          version: { increment: 1 },
          updatedBy: scope.userId,
        },
      });
    });
  }
}
