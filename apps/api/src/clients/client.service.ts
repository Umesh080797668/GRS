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
import { CANONICAL_LOOKUPS } from '../lookups/lookup.data';
import { SyncService } from '../sync/sync.service';

const VALID_EDUCATION_CODES = new Set(
  CANONICAL_LOOKUPS.filter((l) => l.category === 'education').map(
    (l) => l.code,
  ),
);
const VALID_VOCATIONAL_CODES = new Set(
  CANONICAL_LOOKUPS.filter(
    (l) => l.category === 'vocational_qualification',
  ).map((l) => l.code),
);
const VALID_STREAM_CODES = new Set(
  CANONICAL_LOOKUPS.filter((l) => l.category === 'vocational_stream').map(
    (l) => l.code,
  ),
);
const VALID_JOB_CODES = new Set(
  CANONICAL_LOOKUPS.filter((l) => l.category === 'job').map((l) => l.code),
);
const VALID_INFO_PROVIDED_BY = new Set([
  'self',
  'mother',
  'father',
  'sister',
  'other',
]);

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
  ): Promise<{ clients: any[]; totalCount?: number; nextCursor?: string }> {
    // 1. Mandatory scope enforcement
    let scopeFilter: Record<string, any>;

    if (caller.role === UserRole.cdc_secretary) {
      if (!caller.teamId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_SCOPE',
          message: 'CDC Secretary missing team scope',
        });
      }
      if (query.teamId && query.teamId !== caller.teamId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_SCOPE',
          message: 'Cannot access clients outside assigned team',
        });
      }
      scopeFilter = { deletedAt: null, teamId: caller.teamId };
    } else if (caller.role === UserRole.team_member) {
      scopeFilter = { deletedAt: null, collectedBy: caller.userId };
    } else {
      scopeFilter = this.scopeService.getClientScopeFilter(caller);
    }

    // 2. Build caller query filters
    const userFilter: Record<string, any> = {};
    if (query.teamId) userFilter.teamId = query.teamId;
    if (query.gnId) userFilter.gnId = query.gnId;
    if (query.dsId) userFilter.dsId = query.dsId;
    if (query.districtId) userFilter.districtId = query.districtId;
    if (query.householdId) userFilter.householdId = query.householdId;

    if (query.gender && query.gender !== 'all') {
      const g = query.gender.toUpperCase();
      if (g === 'M' || g === 'MALE') {
        userFilter.gender = 'M';
      } else if (g === 'F' || g === 'FEMALE') {
        userFilter.gender = 'F';
      }
    }

    let beneficiaryCondition: Record<string, any> | undefined;
    if (query.beneficiary && query.beneficiary !== 'all') {
      switch (query.beneficiary) {
        case 'aswesuma':
          userFilter.isAswesuma = true;
          break;
        case 'samurdhi':
          userFilter.isSamurdhi = true;
          break;
        case 'epf':
          beneficiaryCondition = { OR: [{ isEpf: true }, { isEtf: true }] };
          break;
        case 'special_needs':
          userFilter.hasSpecialNeeds = true;
          break;
      }
    }

    if (query.language && query.language !== 'all') {
      if (query.language === 'si') {
        userFilter.household = { ...userFilter.household, langSinhala: true };
      } else if (query.language === 'ta') {
        userFilter.household = { ...userFilter.household, langTamil: true };
      } else if (query.language === 'en') {
        userFilter.household = { ...userFilter.household, langEnglish: true };
      }
    }

    let searchCondition: Record<string, any> | undefined;
    if (query.search) {
      const s = query.search.trim();
      searchCondition = {
        OR: [
          { name: { contains: s, mode: 'insensitive' } },
          { phoneRaw: { contains: s } },
          { phoneE164: { contains: s } },
        ],
      };
    }

    const whereCondition = this.scopeService.combineConditions(
      scopeFilter,
      userFilter,
      beneficiaryCondition,
      searchCondition,
    );

    const limit = query.limit ?? 50;

    const clientsPromise = this.prisma.client.findMany({
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
      ...(query.cursor && query.cursor.trim().length > 0
        ? {
          cursor: { id: query.cursor.trim() },
          skip: 1,
        }
        : {}),
    });

    const shouldCount =
      query.includeCount === true || (query.includeCount as any) === 'true';
    const countPromise = shouldCount
      ? this.prisma.client.count({ where: whereCondition })
      : Promise.resolve(undefined);

    const [clients, totalCount] = await Promise.all([
      clientsPromise,
      countPromise,
    ]);

    let nextCursor: string | undefined;
    if (clients.length > limit) {
      clients.pop();
      nextCursor = clients[clients.length - 1]?.id;
    }

    const response: {
      clients: any[];
      totalCount?: number;
      nextCursor?: string;
    } = {
      clients,
      nextCursor,
    };
    if (totalCount !== undefined) {
      response.totalCount = totalCount;
    }

    return response;
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

    if (
      caller.role === UserRole.team_member &&
      client.collectedBy !== caller.userId
    ) {
      throw new ForbiddenException({
        code: 'OUT_OF_SCOPE_RECORD',
        message: 'You can only access records you entered',
      });
    }

    if (
      caller.role === UserRole.cdc_secretary &&
      client.teamId !== caller.teamId
    ) {
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
    // Enforce Decision C19: Web data entry is gated by web_entry_roles config (disabled for Level 00 super_admin by default)
    if (caller.role !== UserRole.team_member) {
      const webRolesSetting = this.prisma?.appSetting?.findUnique
        ? await this.prisma.appSetting.findUnique({
          where: { key: 'web_entry_roles' },
        })
        : null;
      const allowedRoles: string[] = Array.isArray(webRolesSetting?.value)
        ? (webRolesSetting!.value as string[])
        : ['cdc_secretary', 'sda', 'dc', 'admin'];

      if (!allowedRoles.includes(caller.role)) {
        throw new ForbiddenException({
          code: 'WEB_ENTRY_RESTRICTED',
          message:
            'Direct web data entry is disabled for your role by default (Decision C19).',
        });
      }
    }

    const household = await this.prisma.household.findUnique({
      where: { id: dto.householdId },
    });

    if (!household || household.deletedAt !== null) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found',
      });
    }

    if (
      caller.role === UserRole.team_member ||
      caller.role === UserRole.cdc_secretary
    ) {
      if (household.teamId !== caller.teamId) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_HOUSEHOLD',
          message:
            'Cannot create client in household not assigned to your team',
        });
      }
    }

    // Consent validation (Blueprint §9 / Invariant B2)
    if (dto.consentGiven !== true) {
      throw new BadRequestException({
        code: 'CONSENT_REQUIRED',
        message: 'Informed consent is mandatory before recording data',
      });
    }

    // Name validation
    const nameVal = GrsValidators.validateName(dto.name);
    if (!nameVal.isValid) {
      throw new BadRequestException({
        code: 'INVALID_NAME',
        message: `Invalid name: ${nameVal.error}`,
      });
    }

    // Age validation
    const ageVal = GrsValidators.validateAge(dto.age);
    if (!ageVal.isValid) {
      throw new BadRequestException({
        code: 'INVALID_AGE',
        message: `Invalid age: ${ageVal.error}`,
      });
    }

    // Gender validation
    const genderVal = GrsValidators.validateGender(dto.gender);
    if (!genderVal.isValid) {
      throw new BadRequestException({
        code: 'INVALID_GENDER',
        message: `Invalid gender: ${genderVal.error}`,
      });
    }

    // Phone normalization
    let phoneE164: string | null = null;
    const phoneInput = dto.phoneRaw || dto.phoneE164;
    if (phoneInput && phoneInput.trim().length > 0) {
      const pRes = GrsValidators.normalizePhone(phoneInput);
      if (!pRes.isValid) {
        throw new BadRequestException({
          code: 'INVALID_PHONE',
          message: `Phone validation failed: ${pRes.error}`,
        });
      }
      phoneE164 = pRes.value!;
    }

    // WhatsApp normalization
    let whatsappE164: string | null = null;
    const whatsappInput = dto.whatsappRaw || dto.whatsappE164;
    if (whatsappInput && whatsappInput.trim().length > 0) {
      const wRes = GrsValidators.normalizeWhatsApp(whatsappInput);
      if (!wRes.isValid) {
        throw new BadRequestException({
          code: 'INVALID_WHATSAPP',
          message: `WhatsApp validation failed: ${wRes.error}`,
        });
      }
      whatsappE164 = wRes.value!;
    }

    // Dropdown codes validation
    if (
      dto.highestEducation &&
      !VALID_EDUCATION_CODES.has(dto.highestEducation)
    ) {
      throw new BadRequestException({
        code: 'INVALID_LOOKUP_CODE',
        message: `Invalid highest education code: ${dto.highestEducation}`,
      });
    }
    if (
      dto.highestVocational &&
      !VALID_VOCATIONAL_CODES.has(dto.highestVocational)
    ) {
      throw new BadRequestException({
        code: 'INVALID_LOOKUP_CODE',
        message: `Invalid highest vocational qualification code: ${dto.highestVocational}`,
      });
    }
    if (
      dto.interestedVocationalStream &&
      !VALID_STREAM_CODES.has(dto.interestedVocationalStream)
    ) {
      throw new BadRequestException({
        code: 'INVALID_LOOKUP_CODE',
        message: `Invalid interested vocational stream code: ${dto.interestedVocationalStream}`,
      });
    }
    if (dto.interestedJob && !VALID_JOB_CODES.has(dto.interestedJob)) {
      throw new BadRequestException({
        code: 'INVALID_LOOKUP_CODE',
        message: `Invalid interested job code: ${dto.interestedJob}`,
      });
    }
    if (dto.futureHopes && dto.futureHopes.length > 0) {
      const hopesRes = GrsValidators.validateFutureHopes(dto.futureHopes);
      if (!hopesRes.isValid) {
        throw new BadRequestException({
          code: 'INVALID_FUTURE_HOPES',
          message: `Future hopes validation failed: ${hopesRes.error}`,
        });
      }
    }
    const rawInfoBy = String(dto.infoProvidedBy || 'self').toLowerCase();
    if (!VALID_INFO_PROVIDED_BY.has(rawInfoBy)) {
      throw new BadRequestException({
        code: 'INVALID_INFO_PROVIDED_BY',
        message:
          'Information provided by must be one of: self, mother, father, sister, other',
      });
    }

    const nameNorm = dto.name.trim().toLowerCase().replace(/\s+/g, ' ');

    // Deterministic contentHash aligned with /sync/push
    const contentHash = SyncService.computeContentHash({
      householdId: dto.householdId,
      name: nameVal.value!,
      age: ageVal.value!,
      gender: genderVal.value!,
      address: dto.address?.trim() || household.address,
      phoneE164,
      whatsappE164,
      highestEducation: dto.highestEducation || null,
      highestVocational: dto.highestVocational || null,
      interestedVocationalStream: dto.interestedVocationalStream || null,
      interestedJob: dto.interestedJob || null,
      isEpf: dto.isEpf ?? false,
      isEtf: dto.isEtf ?? false,
      isAswesuma: dto.isAswesuma ?? false,
      isSamurdhi: dto.isSamurdhi ?? false,
      hasSpecialNeeds: dto.hasSpecialNeeds ?? false,
      futureHopes: dto.futureHopes || [],
      infoProvidedBy: rawInfoBy,
      infoProvidedByOther: dto.infoProvidedByOther?.trim() || null,
      consentGiven: true,
    });

    // Idempotent duplicate check: If exact same client survey exists, return it
    const existing = await this.prisma.client.findFirst({
      where: {
        householdId: dto.householdId,
        contentHash,
        deletedAt: null,
      },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          householdId: dto.householdId,
          districtId: household.districtId,
          dsId: household.dsId,
          gnId: household.gnId,
          teamId: household.teamId,
          name: nameVal.value!,
          nameNorm,
          age: ageVal.value!,
          gender: genderVal.value! as any,
          address: dto.address?.trim() || household.address,
          phoneRaw: dto.phoneRaw?.trim() || null,
          phoneE164,
          whatsappRaw: dto.whatsappRaw?.trim() || null,
          whatsappE164,
          highestEducation: dto.highestEducation || null,
          highestVocational: dto.highestVocational || null,
          interestedVocationalStream: dto.interestedVocationalStream || null,
          interestedJob: dto.interestedJob || null,
          isEpf: dto.isEpf ?? false,
          isEtf: dto.isEtf ?? false,
          isAswesuma: dto.isAswesuma ?? false,
          isSamurdhi: dto.isSamurdhi ?? false,
          hasSpecialNeeds: dto.hasSpecialNeeds ?? false,
          futureHopes: dto.futureHopes || [],
          infoProvidedBy: rawInfoBy as any,
          infoProvidedByOther: dto.infoProvidedByOther?.trim() || null,
          consentGiven: true,
          consentAt: dto.consentAt ? new Date(dto.consentAt) : new Date(),
          consentVersion: dto.consentVersion || 'consent.v0',
          collectedBy: caller.userId,
          collectedAt: new Date(),
          clientUpdatedAt: new Date(),
          contentHash,
          createdBy: caller.userId,
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
        message:
          'Enumerators cannot edit records after sync. Contact your team leader (Decision C2).',
      });
    }

    if (
      caller.role === UserRole.cdc_secretary &&
      client.teamId !== caller.teamId
    ) {
      throw new ForbiddenException({
        code: 'OUT_OF_SCOPE_TEAM',
        message: 'CDC Secretary can only correct records from their own team',
      });
    }

    let nameNorm = client.nameNorm;
    let validatedName = client.name;
    if (dto.name && dto.name !== client.name) {
      const nameVal = GrsValidators.validateName(dto.name);
      if (!nameVal.isValid) {
        throw new BadRequestException({
          code: 'INVALID_NAME',
          message: `Invalid name: ${nameVal.error}`,
        });
      }
      validatedName = nameVal.value!;
      nameNorm = validatedName.trim().toLowerCase().replace(/\s+/g, ' ');
    }

    // Age validation if provided
    let validatedAge = client.age;
    if (dto.age !== undefined) {
      const ageVal = GrsValidators.validateAge(dto.age);
      if (!ageVal.isValid) {
        throw new BadRequestException({
          code: 'INVALID_AGE',
          message: `Invalid age: ${ageVal.error}`,
        });
      }
      validatedAge = ageVal.value!;
    }

    // Gender validation if provided
    let validatedGender = client.gender;
    if (dto.gender !== undefined) {
      const genderVal = GrsValidators.validateGender(dto.gender);
      if (!genderVal.isValid) {
        throw new BadRequestException({
          code: 'INVALID_GENDER',
          message: `Invalid gender: ${genderVal.error}`,
        });
      }
      validatedGender = genderVal.value! as any;
    }

    // Phone validation / normalization
    let resolvedPhoneE164: string | null = client.phoneE164;
    let resolvedPhoneRaw: string | null = client.phoneRaw;
    if (dto.phoneRaw !== undefined) {
      resolvedPhoneRaw = dto.phoneRaw ? dto.phoneRaw.trim() : null;
      if (resolvedPhoneRaw && resolvedPhoneRaw.length > 0) {
        const pRes = GrsValidators.normalizePhone(resolvedPhoneRaw);
        if (!pRes.isValid) {
          throw new BadRequestException({
            code: 'INVALID_PHONE',
            message: `Phone validation failed: ${pRes.error}`,
          });
        }
        resolvedPhoneE164 = pRes.value!;
      } else {
        resolvedPhoneE164 = null;
      }
    } else if (dto.phoneE164 !== undefined) {
      if (dto.phoneE164 && dto.phoneE164.trim().length > 0) {
        const pRes = GrsValidators.normalizePhone(dto.phoneE164);
        if (!pRes.isValid) {
          throw new BadRequestException({
            code: 'INVALID_PHONE',
            message: `Phone validation failed: ${pRes.error}`,
          });
        }
        resolvedPhoneE164 = pRes.value!;
      } else {
        resolvedPhoneE164 = null;
      }
    }

    // WhatsApp validation / normalization
    let resolvedWhatsappE164: string | null = client.whatsappE164;
    let resolvedWhatsappRaw: string | null = client.whatsappRaw;
    if (dto.whatsappRaw !== undefined) {
      resolvedWhatsappRaw = dto.whatsappRaw ? dto.whatsappRaw.trim() : null;
      if (resolvedWhatsappRaw && resolvedWhatsappRaw.length > 0) {
        const wRes = GrsValidators.normalizeWhatsApp(resolvedWhatsappRaw);
        if (!wRes.isValid) {
          throw new BadRequestException({
            code: 'INVALID_WHATSAPP',
            message: `WhatsApp validation failed: ${wRes.error}`,
          });
        }
        resolvedWhatsappE164 = wRes.value!;
      } else {
        resolvedWhatsappE164 = null;
      }
    } else if (dto.whatsappE164 !== undefined) {
      if (dto.whatsappE164 && dto.whatsappE164.trim().length > 0) {
        const wRes = GrsValidators.normalizeWhatsApp(dto.whatsappE164);
        if (!wRes.isValid) {
          throw new BadRequestException({
            code: 'INVALID_WHATSAPP',
            message: `WhatsApp validation failed: ${wRes.error}`,
          });
        }
        resolvedWhatsappE164 = wRes.value!;
      } else {
        resolvedWhatsappE164 = null;
      }
    }

    // Dropdown codes validation
    if (
      dto.highestEducation !== undefined &&
      dto.highestEducation !== null &&
      dto.highestEducation !== ''
    ) {
      if (!VALID_EDUCATION_CODES.has(dto.highestEducation)) {
        throw new BadRequestException({
          code: 'INVALID_LOOKUP_CODE',
          message: `Invalid highest education code: ${dto.highestEducation}`,
        });
      }
    }
    if (
      dto.highestVocational !== undefined &&
      dto.highestVocational !== null &&
      dto.highestVocational !== ''
    ) {
      if (!VALID_VOCATIONAL_CODES.has(dto.highestVocational)) {
        throw new BadRequestException({
          code: 'INVALID_LOOKUP_CODE',
          message: `Invalid highest vocational qualification code: ${dto.highestVocational}`,
        });
      }
    }
    if (
      dto.interestedVocationalStream !== undefined &&
      dto.interestedVocationalStream !== null &&
      dto.interestedVocationalStream !== ''
    ) {
      if (!VALID_STREAM_CODES.has(dto.interestedVocationalStream)) {
        throw new BadRequestException({
          code: 'INVALID_LOOKUP_CODE',
          message: `Invalid interested vocational stream code: ${dto.interestedVocationalStream}`,
        });
      }
    }
    if (
      dto.interestedJob !== undefined &&
      dto.interestedJob !== null &&
      dto.interestedJob !== ''
    ) {
      if (!VALID_JOB_CODES.has(dto.interestedJob)) {
        throw new BadRequestException({
          code: 'INVALID_LOOKUP_CODE',
          message: `Invalid interested job code: ${dto.interestedJob}`,
        });
      }
    }
    if (
      dto.futureHopes !== undefined &&
      dto.futureHopes !== null &&
      dto.futureHopes.length > 0
    ) {
      const hopesRes = GrsValidators.validateFutureHopes(dto.futureHopes);
      if (!hopesRes.isValid) {
        throw new BadRequestException({
          code: 'INVALID_FUTURE_HOPES',
          message: `Future hopes validation failed: ${hopesRes.error}`,
        });
      }
    }
    if (dto.infoProvidedBy !== undefined && dto.infoProvidedBy !== null) {
      const rawInfoBy = String(dto.infoProvidedBy).toLowerCase();
      if (!VALID_INFO_PROVIDED_BY.has(rawInfoBy)) {
        throw new BadRequestException({
          code: 'INVALID_INFO_PROVIDED_BY',
          message:
            'Information provided by must be one of: self, mother, father, sister, other',
        });
      }
    }

    // Recompute contentHash
    const mergedHighestEducation =
      dto.highestEducation !== undefined
        ? dto.highestEducation
        : client.highestEducation;
    const mergedHighestVocational =
      dto.highestVocational !== undefined
        ? dto.highestVocational
        : client.highestVocational;
    const mergedInterestedVocationalStream =
      dto.interestedVocationalStream !== undefined
        ? dto.interestedVocationalStream
        : client.interestedVocationalStream;
    const mergedInterestedJob =
      dto.interestedJob !== undefined
        ? dto.interestedJob
        : client.interestedJob;
    const mergedIsEpf = dto.isEpf !== undefined ? dto.isEpf : client.isEpf;
    const mergedIsEtf = dto.isEtf !== undefined ? dto.isEtf : client.isEtf;
    const mergedIsAswesuma =
      dto.isAswesuma !== undefined ? dto.isAswesuma : client.isAswesuma;
    const mergedIsSamurdhi =
      dto.isSamurdhi !== undefined ? dto.isSamurdhi : client.isSamurdhi;
    const mergedHasSpecialNeeds =
      dto.hasSpecialNeeds !== undefined
        ? dto.hasSpecialNeeds
        : client.hasSpecialNeeds;
    const mergedFutureHopes =
      dto.futureHopes !== undefined ? dto.futureHopes : client.futureHopes;
    const mergedInfoProvidedBy =
      dto.infoProvidedBy !== undefined
        ? String(dto.infoProvidedBy)
        : client.infoProvidedBy;
    const mergedInfoProvidedByOther =
      dto.infoProvidedByOther !== undefined
        ? dto.infoProvidedByOther?.trim() || null
        : client.infoProvidedByOther;
    const mergedAddress =
      dto.address !== undefined ? dto.address?.trim() || null : client.address;

    const newContentHash = SyncService.computeContentHash({
      householdId: client.householdId,
      name: validatedName,
      age: validatedAge,
      gender: validatedGender,
      address: mergedAddress,
      phoneE164: resolvedPhoneE164,
      whatsappE164: resolvedWhatsappE164,
      highestEducation: mergedHighestEducation,
      highestVocational: mergedHighestVocational,
      interestedVocationalStream: mergedInterestedVocationalStream,
      interestedJob: mergedInterestedJob,
      isEpf: mergedIsEpf,
      isEtf: mergedIsEtf,
      isAswesuma: mergedIsAswesuma,
      isSamurdhi: mergedIsSamurdhi,
      hasSpecialNeeds: mergedHasSpecialNeeds,
      futureHopes: mergedFutureHopes,
      infoProvidedBy: mergedInfoProvidedBy,
      infoProvidedByOther: mergedInfoProvidedByOther,
      consentGiven: client.consentGiven,
    });

    return this.prisma.$transaction(async (tx) => {
      // 1. Audit trail record in client_audit (M1.13, Decision C2)
      await tx.clientAudit.create({
        data: {
          clientId: id,
          changedBy: caller.userId,
          reason:
            dto.correctionReason?.trim() || 'Correction by Level 4 Team Leader',
          before: client,
          after: { ...client, ...dto },
        },
      });

      // 2. Apply field updates
      const updated = await tx.client.update({
        where: { id },
        data: {
          name: dto.name ? validatedName : undefined,
          nameNorm,
          age: dto.age !== undefined ? validatedAge : undefined,
          gender: dto.gender !== undefined ? validatedGender : undefined,
          address: dto.address !== undefined ? mergedAddress : undefined,
          phoneRaw: dto.phoneRaw !== undefined ? resolvedPhoneRaw : undefined,
          phoneE164: resolvedPhoneE164,
          whatsappRaw:
            dto.whatsappRaw !== undefined ? resolvedWhatsappRaw : undefined,
          whatsappE164: resolvedWhatsappE164,
          highestEducation: mergedHighestEducation,
          highestVocational: mergedHighestVocational,
          interestedVocationalStream: mergedInterestedVocationalStream,
          interestedJob: mergedInterestedJob,
          isEpf: dto.isEpf,
          isEtf: dto.isEtf,
          isAswesuma: dto.isAswesuma,
          isSamurdhi: dto.isSamurdhi,
          hasSpecialNeeds: dto.hasSpecialNeeds,
          futureHopes: dto.futureHopes,
          infoProvidedBy: dto.infoProvidedBy as any,
          infoProvidedByOther: mergedInfoProvidedByOther,
          contentHash: newContentHash,
          serverVersion: { increment: 1 },
          updatedAt: new Date(),
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
