import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope/scope.service';
import { ScopeContext, UserRole } from '../common/scope/scope.types';
import { GrsValidators } from '../common/validators/grs-validators';
import {
  CreateClientDto,
  UpdateClientDto,
  ListClientsDto,
} from './dto/client.dto';

@Injectable()
export class ClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: ScopeService,
  ) { }

  /**
   * Keyset-paged clients within caller scope (Blueprint §5.5, §10.2).
   * L5: own collected records.
   * L4: team records.
   * L00: all records.
   */
  async getClients(
    caller: ScopeContext,
    query: ListClientsDto,
  ): Promise<{ clients: any[]; totalCount: number; nextCursor?: string }> {
    const whereCondition: Record<string, any> = { deletedAt: null };

    if (caller.role === UserRole.team_member) {
      whereCondition.collectedBy = caller.userId;
    } else if (caller.role === UserRole.cdc_secretary) {
      if (!caller.teamId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_SCOPE',
          message: 'CDC Secretary missing team scope',
        });
      }
      whereCondition.teamId = caller.teamId;
    } else if (caller.role === UserRole.super_admin) {
      if (query.teamId) whereCondition.teamId = query.teamId;
      if (query.gnId) whereCondition.gnId = query.gnId;
    } else {
      const scopeFilter = this.scopeService.getClientScopeFilter(caller);
      Object.assign(whereCondition, scopeFilter);
      if (query.teamId) whereCondition.teamId = query.teamId;
      if (query.gnId) whereCondition.gnId = query.gnId;
    }

    if (query.householdId) {
      whereCondition.householdId = query.householdId;
    }

    if (query.search) {
      const s = query.search.trim();
      whereCondition.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { phoneRaw: { contains: s } },
        { phoneE164: { contains: s } },
      ];
    }

    const limit = query.limit ?? 50;

    const [clients, totalCount] = await Promise.all([
      this.prisma.client.findMany({
        where: whereCondition,
        take: limit + 1,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        include: {
          household: {
            select: { id: true, houseNo: true, serialNo: true, address: true },
          },
          collector: {
            select: { id: true, fullName: true, userCode: true },
          },
        },
      }),
      this.prisma.client.count({ where: whereCondition }),
    ]);

    let nextCursor: string | undefined;
    if (clients.length > limit) {
      const nextItem = clients.pop();
      nextCursor = nextItem?.id;
    }

    return {
      clients,
      totalCount,
      nextCursor,
    };
  }

  /**
   * Retrieves single client with territorial verification.
   */
  async getClientById(caller: ScopeContext, id: string): Promise<any> {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        household: true,
        collector: { select: { id: true, fullName: true, userCode: true } },
      },
    });

    if (!client || client.deletedAt !== null) {
      throw new NotFoundException({
        code: 'CLIENT_NOT_FOUND',
        message: 'Client record not found',
      });
    }

    if (caller.role === UserRole.team_member && client.collectedBy !== caller.userId) {
      throw new ForbiddenException({
        code: 'OUT_OF_SCOPE_RECORD',
        message: 'You can only access records you entered',
      });
    }

    if (caller.role === UserRole.cdc_secretary && client.teamId !== caller.teamId) {
      throw new ForbiddenException({
        code: 'OUT_OF_SCOPE_TEAM',
        message: 'You can only access records entered by your team',
      });
    }

    return client;
  }

  /**
   * Direct client data entry online (M5.8 / M4.4).
   */
  async createClient(caller: ScopeContext, dto: CreateClientDto): Promise<any> {
    const household = await this.prisma.household.findUnique({
      where: { id: dto.householdId },
    });

    if (!household || household.deletedAt !== null) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found',
      });
    }

    if (caller.role === UserRole.team_member || caller.role === UserRole.cdc_secretary) {
      if (household.teamId !== caller.teamId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_HOUSEHOLD',
          message: 'Cannot create client in household not assigned to your team',
        });
      }
    }

    const nameVal = GrsValidators.validateName(dto.name);
    if (!nameVal.isValid) {
      throw new BadRequestException({
        code: 'INVALID_NAME',
        message: `Invalid name: ${nameVal.error}`,
      });
    }

    const ageVal = GrsValidators.validateAge(dto.age);
    if (!ageVal.isValid) {
      throw new BadRequestException({
        code: 'INVALID_AGE',
        message: `Invalid age: ${ageVal.error}`,
      });
    }

    const nameNorm = dto.name.trim().toLowerCase().replace(/\s+/g, ' ');

    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          householdId: dto.householdId,
          districtId: household.districtId,
          dsId: household.dsId,
          gnId: household.gnId,
          teamId: household.teamId,
          name: dto.name.trim(),
          nameNorm,
          age: ageVal.value!,
          gender: dto.gender,
          address: dto.address?.trim() || household.address,
          phoneRaw: dto.phoneRaw?.trim() || null,
          phoneE164: dto.phoneE164?.trim() || null,
          whatsappRaw: dto.whatsappRaw?.trim() || null,
          whatsappE164: dto.whatsappE164?.trim() || null,
          highestEducation: dto.highestEducation || null,
          highestVocational: dto.highestVocational || null,
          interestedVocationalStream: dto.interestedVocationalStream || null,
          interestedJob: dto.interestedJob || null,
          isEpf: dto.isEpf ?? false,
          isEtf: dto.isEtf ?? false,
          isAswesuma: dto.isAswesuma ?? false,
          isSamurdhi: dto.isSamurdhi ?? false,
          hasSpecialNeeds: dto.hasSpecialNeeds,
          futureHopes: dto.futureHopes || [],
          infoProvidedBy: dto.infoProvidedBy,
          infoProvidedByOther: dto.infoProvidedByOther?.trim() || null,
          consentGiven: dto.consentGiven,
          consentAt: dto.consentAt ? new Date(dto.consentAt) : new Date(),
          consentVersion: dto.consentVersion || '1.0',
          collectedBy: caller.userId,
        },
      });

      if (household.teamId) {
        await tx.team.update({
          where: { id: household.teamId },
          data: { statsDirtyAt: new Date() },
        });
      }

      return client;
    });
  }

  /**
   * Correction of client fields with audit trail (Decision C2, C13, M4.4).
   * Level 4 (CDC Secretary for own team) and Level 00 (Super Admin) can edit.
   * Level 5 (Team Member) is locked from editing synced records.
   */
  async updateClient(
    caller: ScopeContext,
    id: string,
    dto: UpdateClientDto,
  ): Promise<any> {
    const client = await this.getClientById(caller, id);

    // Decision C2: Level 5 cannot edit synced records
    if (caller.role === UserRole.team_member) {
      throw new ForbiddenException({
        code: 'LOCKED_RECORD',
        message: 'Enumerators cannot edit records after sync. Contact your team leader (Decision C2).',
      });
    }

    if (caller.role === UserRole.cdc_secretary && client.teamId !== caller.teamId) {
      throw new ForbiddenException({
        code: 'OUT_OF_SCOPE_TEAM',
        message: 'CDC Secretary can only correct records from their own team',
      });
    }

    let nameNorm = client.nameNorm;
    if (dto.name && dto.name !== client.name) {
      const nameVal = GrsValidators.validateName(dto.name);
      if (!nameVal.isValid) {
        throw new BadRequestException({
          code: 'INVALID_NAME',
          message: `Invalid name: ${nameVal.error}`,
        });
      }
      nameNorm = dto.name.trim().toLowerCase().replace(/\s+/g, ' ');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Audit trail record in client_audit (M1.13, Decision C2)
      await tx.clientAudit.create({
        data: {
          clientId: id,
          actorId: caller.userId,
          action: 'correction',
          reason: dto.correctionReason?.trim() || 'Correction by Level 4 Team Leader',
          changes: dto as any,
        },
      });

      // 2. Apply field updates
      const updated = await tx.client.update({
        where: { id },
        data: {
          name: dto.name ? dto.name.trim() : undefined,
          nameNorm,
          age: dto.age,
          gender: dto.gender,
          address: dto.address !== undefined ? dto.address?.trim() || null : undefined,
          phoneRaw: dto.phoneRaw !== undefined ? dto.phoneRaw?.trim() || null : undefined,
          phoneE164: dto.phoneE164 !== undefined ? dto.phoneE164?.trim() || null : undefined,
          whatsappRaw: dto.whatsappRaw !== undefined ? dto.whatsappRaw?.trim() || null : undefined,
          whatsappE164: dto.whatsappE164 !== undefined ? dto.whatsappE164?.trim() || null : undefined,
          highestEducation: dto.highestEducation,
          highestVocational: dto.highestVocational,
          interestedVocationalStream: dto.interestedVocationalStream,
          interestedJob: dto.interestedJob,
          isEpf: dto.isEpf,
          isEtf: dto.isEtf,
          isAswesuma: dto.isAswesuma,
          isSamurdhi: dto.isSamurdhi,
          hasSpecialNeeds: dto.hasSpecialNeeds,
          futureHopes: dto.futureHopes,
          infoProvidedBy: dto.infoProvidedBy,
          infoProvidedByOther: dto.infoProvidedByOther !== undefined ? dto.infoProvidedByOther?.trim() || null : undefined,
          serverVersion: { increment: 1 },
        },
      });

      if (client.teamId) {
        await tx.team.update({
          where: { id: client.teamId },
          data: { statsDirtyAt: new Date() },
        });
      }

      return updated;
    });
  }
}
