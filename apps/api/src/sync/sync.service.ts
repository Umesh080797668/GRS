import {
  Injectable,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LookupService } from '../lookups/lookup.service';
import { ScopeService } from '../common/scope/scope.service';
import { GrsValidators } from '../common/validators/grs-validators';
import type { ScopeContext } from '../common/scope/scope.types';
import {
  SyncPushDto,
  SyncPushResponse,
  SyncRecordPayloadDto,
  SyncRecordResultItem,
} from './dto/sync-push.dto';
import { SyncChangesResponse } from './dto/sync-changes.dto';

export interface AreaSyncResult {
  items: any[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
  lookups?: Record<string, any[]>;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupService: LookupService,
    private readonly scopeService: ScopeService,
  ) { }

  /**
   * Normalizes a person name according to Build Plan §9:
   * NFC, lowercase, strip honorifics, remove punctuation and zero-width characters, sort name tokens.
   */
  static normalizeName(name: string): string {
    if (!name) return '';
    return name
      .normalize('NFC')
      .toLowerCase()
      .replace(/\b(mr|mrs|miss|ms|rev|dr|prof|ven)\b\.?/gi, '')
      .replace(/[\p{P}\p{S}\u200B-\u200D\uFEFF]/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(' ');
  }

  /**
   * Deterministic SHA-256 hash of client core content for duplicate & retry idempotency.
   */
  static computeContentHash(data: {
    householdId: string;
    name: string;
    age: number;
    gender: string;
    address?: string | null;
    phoneE164?: string | null;
    whatsappE164?: string | null;
    highestEducation?: string | null;
    highestVocational?: string | null;
    interestedVocationalStream?: string | null;
    interestedJob?: string | null;
    isEpf?: boolean;
    isEtf?: boolean;
    isAswesuma?: boolean;
    isSamurdhi?: boolean;
    hasSpecialNeeds?: boolean;
    futureHopes?: string[];
    infoProvidedBy: string;
    infoProvidedByOther?: string | null;
    consentGiven: boolean;
  }): string {
    const canonical = {
      householdId: data.householdId,
      name: data.name.trim(),
      age: data.age,
      gender: data.gender,
      address: data.address?.trim() || '',
      phoneE164: data.phoneE164 || '',
      whatsappE164: data.whatsappE164 || '',
      highestEducation: data.highestEducation || '',
      highestVocational: data.highestVocational || '',
      interestedVocationalStream: data.interestedVocationalStream || '',
      interestedJob: data.interestedJob || '',
      isEpf: !!data.isEpf,
      isEtf: !!data.isEtf,
      isAswesuma: !!data.isAswesuma,
      isSamurdhi: !!data.isSamurdhi,
      hasSpecialNeeds: !!data.hasSpecialNeeds,
      futureHopes: (data.futureHopes || []).slice().sort(),
      infoProvidedBy: data.infoProvidedBy,
      infoProvidedByOther: data.infoProvidedByOther?.trim() || '',
      consentGiven: !!data.consentGiven,
    };
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(canonical))
      .digest('hex');
  }

  /**
   * Paged, resumable area download endpoint per DD-Campaign_Agent_Build_Plan.md §6.2.
   */
  async getAreaData(
    user: ScopeContext,
    cursor?: string,
    limit: number = 500,
  ): Promise<AreaSyncResult> {
    if (!user || !user.role) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_SCOPE',
        message_key: 'errors.scope.missing_role',
      });
    }

    const where = this.scopeService.getHouseholdScopeFilter(user);
    const take = Math.min(Math.max(1, limit), 500);

    const queryArgs: any = {
      where,
      orderBy: [{ serialNo: 'asc' }, { id: 'asc' }],
      take: take + 1,
    };

    if (cursor) {
      queryArgs.cursor = { id: cursor };
      queryArgs.skip = 1;
    }

    const [households, totalCount] = await Promise.all([
      this.prisma.household.findMany(queryArgs),
      this.prisma.household.count({ where }),
    ]);

    const hasMore = households.length > take;
    const items = hasMore ? households.slice(0, take) : households;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    let lookups: Record<string, any[]> | undefined;
    if (!cursor) {
      try {
        const catLookups = await this.lookupService.getCategorizedLookups();
        lookups = catLookups.categories;
      } catch (err: any) {
        this.logger.warn(
          `Failed to attach lookups to initial area sync: ${err.message}`,
        );
      }
    }

    return {
      items: items.map((h) => ({
        id: h.id,
        districtId: h.districtId,
        dsId: h.dsId,
        gnId: h.gnId,
        teamId: h.teamId,
        serialNo: h.serialNo,
        houseNo: h.houseNo,
        houseNoNorm: h.houseNoNorm,
        houseLeaderName: h.houseLeaderName,
        address: h.address,
        villageName: h.villageName,
        isEpf: h.isEpf,
        isEtf: h.isEtf,
        isAswesuma: h.isAswesuma,
        isSamurdhi: h.isSamurdhi,
        hasSpecialNeeds: h.hasSpecialNeeds,
        targetFemale: h.targetFemale,
        targetMale: h.targetMale,
        ageGroupMin: h.ageGroupMin,
        ageGroupMax: h.ageGroupMax,
        langSinhala: h.langSinhala,
        langTamil: h.langTamil,
        langEnglish: h.langEnglish,
        version: h.version,
        createdAt: h.createdAt.toISOString(),
        updatedAt: h.updatedAt.toISOString(),
      })),
      nextCursor,
      hasMore,
      total: totalCount,
      lookups,
    };
  }

  /**
   * Incremental sync changes feed (delta) since cursor/timestamp per Build Plan §8.3 & Blueprint §6.2.
   * Returns household updates, soft-deletions, and server updates.
   */
  async getChanges(
    user: ScopeContext,
    since?: string,
  ): Promise<SyncChangesResponse> {
    if (!user || !user.role) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_SCOPE',
        message_key: 'errors.scope.missing_role',
      });
    }

    const whereScope = this.scopeService.getHouseholdScopeFilter(user);
    const sinceDate = since ? new Date(since) : new Date(0);

    const [updatedHouseholds, deletedHouseholds] = await Promise.all([
      this.prisma.household.findMany({
        where: {
          ...whereScope,
          updatedAt: { gt: sinceDate },
          deletedAt: null,
        },
        orderBy: { updatedAt: 'asc' },
      }),
      this.prisma.household.findMany({
        where: {
          ...whereScope,
          deletedAt: { gt: sinceDate },
        },
        select: {
          id: true,
          deletedAt: true,
          deletedReason: true,
        },
      }),
    ]);

    return {
      serverTime: new Date().toISOString(),
      households: updatedHouseholds.map((h) => ({
        id: h.id,
        districtId: h.districtId,
        dsId: h.dsId,
        gnId: h.gnId,
        teamId: h.teamId,
        serialNo: h.serialNo,
        houseNo: h.houseNo,
        houseNoNorm: h.houseNoNorm,
        houseLeaderName: h.houseLeaderName,
        address: h.address,
        villageName: h.villageName,
        isEpf: h.isEpf,
        isEtf: h.isEtf,
        isAswesuma: h.isAswesuma,
        isSamurdhi: h.isSamurdhi,
        hasSpecialNeeds: h.hasSpecialNeeds,
        targetFemale: h.targetFemale,
        targetMale: h.targetMale,
        ageGroupMin: h.ageGroupMin,
        ageGroupMax: h.ageGroupMax,
        langSinhala: h.langSinhala,
        langTamil: h.langTamil,
        langEnglish: h.langEnglish,
        version: h.version,
        createdAt: h.createdAt.toISOString(),
        updatedAt: h.updatedAt.toISOString(),
      })),
      deletedHouseholds: deletedHouseholds.map((d) => ({
        id: d.id,
        deletedAt: d.deletedAt!.toISOString(),
        deletedReason: d.deletedReason,
      })),
      clients: [],
    };
  }

  /**
   * Bulk upsert client survey records (POST /sync/push) per Build Plan §8.3.
   * Invariants:
   * 1. Validate every record in code against shared rules (Appendix A vectors).
   * 2. Query 1: Load existing client rows.
   * 3. Query 2: Load households for scope & soft-deletion checks.
   * 4. Query 3: Execute single bulk SQL statement with ON CONFLICT DO UPDATE and RETURNING.
   * 5. Total database queries <= 3 for a 50-record batch.
   */
  async pushRecords(
    user: ScopeContext,
    dto: SyncPushDto,
  ): Promise<SyncPushResponse> {
    if (!user || !user.role || !user.userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_SCOPE',
        message_key: 'errors.scope.missing_role',
      });
    }

    if (!dto.records || dto.records.length === 0) {
      return { results: [] };
    }

    const results: SyncRecordResultItem[] = new Array(dto.records.length);
    const validRecords: Array<{
      index: number;
      record: SyncRecordPayloadDto;
      normalized: {
        householdId: string;
        name: string;
        nameNorm: string;
        age: number;
        gender: string;
        address: string | null;
        phoneRaw: string | null;
        phoneE164: string | null;
        whatsappRaw: string | null;
        whatsappE164: string | null;
        highestEducation: string | null;
        highestVocational: string | null;
        interestedVocationalStream: string | null;
        interestedJob: string | null;
        isEpf: boolean;
        isEtf: boolean;
        isAswesuma: boolean;
        isSamurdhi: boolean;
        hasSpecialNeeds: boolean;
        futureHopes: string[];
        infoProvidedBy: string;
        infoProvidedByOther: string | null;
        consentGiven: boolean;
        consentAt: Date;
        consentVersion: string;
        clientUpdatedAt: Date;
        contentHash: string;
      };
    }> = [];

    // --- STEP 1: Code-level validation across all records ---
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validInfoProvidedBy = new Set([
      'self',
      'mother',
      'father',
      'sister',
      'other',
    ]);

    const seenClientIds = new Set<string>();

    for (let i = 0; i < dto.records.length; i++) {
      const record = dto.records[i];
      if (!record.id || !uuidRegex.test(record.id)) {
        results[i] = {
          id: record.id || 'unknown',
          status: 'rejected',
          code: 'INVALID_CLIENT_ID',
          message: 'Client ID must be a valid UUID',
        };
        continue;
      }

      if (seenClientIds.has(record.id)) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'DUPLICATE_IN_BATCH',
          message: 'Duplicate client ID in the same push batch',
        };
        continue;
      }
      seenClientIds.add(record.id);

      const data = record.data || {};
      const householdId = data.household_id || data.householdId;
      if (!householdId || !uuidRegex.test(householdId)) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'INVALID_HOUSEHOLD_ID',
          message: 'Household ID must be a valid UUID',
        };
        continue;
      }

      // Name validation
      const nameRes = GrsValidators.validateName(data.name);
      if (!nameRes.isValid) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'INVALID_NAME',
          message: `Name validation failed: ${nameRes.error}`,
        };
        continue;
      }

      // Age validation
      const ageRes = GrsValidators.validateAge(data.age);
      if (!ageRes.isValid) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'INVALID_AGE',
          message: `Age validation failed: ${ageRes.error}`,
        };
        continue;
      }

      // Gender validation
      const genderRes = GrsValidators.validateGender(data.gender);
      if (!genderRes.isValid) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'INVALID_GENDER',
          message: `Gender validation failed: ${genderRes.error}`,
        };
        continue;
      }

      // Consent validation (Invariant B2)
      const consentGiven = data.consent_given === true || data.consentGiven === true;
      if (!consentGiven) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'CONSENT_REQUIRED',
          message: 'Informed consent is mandatory before recording data',
        };
        continue;
      }

      // Phone normalization (if provided)
      let phoneE164: string | null = null;
      const phoneRaw = data.phone_raw || data.phoneRaw || null;
      if (phoneRaw && String(phoneRaw).trim().length > 0) {
        const pRes = GrsValidators.normalizePhone(String(phoneRaw));
        if (pRes.isValid) {
          phoneE164 = pRes.value!;
        } else {
          results[i] = {
            id: record.id,
            status: 'rejected',
            code: 'INVALID_PHONE',
            message: `Phone validation failed: ${pRes.error}`,
          };
          continue;
        }
      }

      // WhatsApp normalization (if provided)
      let whatsappE164: string | null = null;
      const whatsappRaw = data.whatsapp_raw || data.whatsappRaw || null;
      if (whatsappRaw && String(whatsappRaw).trim().length > 0) {
        const wRes = GrsValidators.normalizeWhatsApp(String(whatsappRaw));
        if (wRes.isValid) {
          whatsappE164 = wRes.value!;
        } else {
          results[i] = {
            id: record.id,
            status: 'rejected',
            code: 'INVALID_WHATSAPP',
            message: `WhatsApp validation failed: ${wRes.error}`,
          };
          continue;
        }
      }

      // Future hopes validation
      const rawHopes = data.future_hopes || data.futureHopes;
      const parsedHopesArray = Array.isArray(rawHopes)
        ? rawHopes
        : typeof rawHopes === 'string' && rawHopes.startsWith('[')
          ? JSON.parse(rawHopes)
          : [];
      const hopesRes = GrsValidators.validateFutureHopes(parsedHopesArray);
      if (!hopesRes.isValid) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'INVALID_FUTURE_HOPES',
          message: `Future hopes validation failed: ${hopesRes.error}`,
        };
        continue;
      }

      // Information provided by validation
      const rawInfoBy = String(data.info_provided_by || data.infoProvidedBy || 'self').toLowerCase();
      if (!validInfoProvidedBy.has(rawInfoBy)) {
        results[i] = {
          id: record.id,
          status: 'rejected',
          code: 'INVALID_INFO_PROVIDED_BY',
          message: `Information provided by must be one of: self, mother, father, sister, other`,
        };
        continue;
      }

      const nameNorm = SyncService.normalizeName(nameRes.value!);
      const consentAt = data.consent_at || data.consentAt
        ? new Date(data.consent_at || data.consentAt)
        : new Date();
      const clientUpdatedAt = record.client_updated_at || data.client_updated_at || data.clientUpdatedAt
        ? new Date(record.client_updated_at || data.client_updated_at || data.clientUpdatedAt)
        : new Date();

      const normalized = {
        householdId,
        name: nameRes.value!,
        nameNorm,
        age: ageRes.value!,
        gender: genderRes.value!,
        address: data.address ? String(data.address).trim() : null,
        phoneRaw: phoneRaw ? String(phoneRaw).trim() : null,
        phoneE164,
        whatsappRaw: whatsappRaw ? String(whatsappRaw).trim() : null,
        whatsappE164,
        highestEducation: data.highest_education || data.highestEducation || null,
        highestVocational: data.highest_vocational || data.highestVocational || null,
        interestedVocationalStream:
          data.interested_vocational_stream || data.interestedVocationalStream || null,
        interestedJob: data.interested_job || data.interestedJob || null,
        isEpf: !!(data.is_epf ?? data.isEpf),
        isEtf: !!(data.is_etf ?? data.isEtf),
        isAswesuma: !!(data.is_aswesuma ?? data.isAswesuma),
        isSamurdhi: !!(data.is_samurdhi ?? data.isSamurdhi),
        hasSpecialNeeds: !!(data.has_special_needs ?? data.hasSpecialNeeds),
        futureHopes: hopesRes.value!,
        infoProvidedBy: rawInfoBy,
        infoProvidedByOther: data.info_provided_by_other || data.infoProvidedByOther || null,
        consentGiven: true,
        consentAt,
        consentVersion: data.consent_version || data.consentVersion || 'consent.v0',
        clientUpdatedAt,
        contentHash: SyncService.computeContentHash({
          householdId,
          name: nameRes.value!,
          age: ageRes.value!,
          gender: genderRes.value!,
          address: data.address,
          phoneE164,
          whatsappE164,
          highestEducation: data.highest_education || data.highestEducation,
          highestVocational: data.highest_vocational || data.highestVocational,
          interestedVocationalStream:
            data.interested_vocational_stream || data.interestedVocationalStream,
          interestedJob: data.interested_job || data.interestedJob,
          isEpf: !!(data.is_epf ?? data.isEpf),
          isEtf: !!(data.is_etf ?? data.isEtf),
          isAswesuma: !!(data.is_aswesuma ?? data.isAswesuma),
          isSamurdhi: !!(data.is_samurdhi ?? data.isSamurdhi),
          hasSpecialNeeds: !!(data.has_special_needs ?? data.hasSpecialNeeds),
          futureHopes: hopesRes.value!,
          infoProvidedBy: rawInfoBy,
          infoProvidedByOther: data.info_provided_by_other || data.infoProvidedByOther,
          consentGiven: true,
        }),
      };

      validRecords.push({ index: i, record, normalized });
    }

    if (validRecords.length === 0) {
      return { results };
    }

    // --- STEP 2: Database checks in 2 parallel or batched queries ---
    const clientIds = validRecords.map((v) => v.record.id);
    const householdIds = [
      ...new Set(validRecords.map((v) => v.normalized.householdId)),
    ];

    // Query 1 & Query 2 (dispatched together)
    const [existingClients, households] = await Promise.all([
      this.prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: {
          id: true,
          collectedBy: true,
          householdId: true,
          serverVersion: true,
          contentHash: true,
        },
      }),
      this.prisma.household.findMany({
        where: { id: { in: householdIds } },
        select: {
          id: true,
          districtId: true,
          dsId: true,
          gnId: true,
          teamId: true,
          address: true,
          deletedAt: true,
        },
      }),
    ]);

    const existingMap = new Map<string, (typeof existingClients)[0]>(
      existingClients.map((c) => [c.id, c]),
    );
    const householdMap = new Map<string, (typeof households)[0]>(
      households.map((h) => [h.id, h]),
    );

    // --- STEP 3: Per-record business decisions in code (§8.3 #3) ---
    const toUpsert: Array<{
      index: number;
      id: string;
      householdId: string;
      districtId: string;
      dsId: string;
      gnId: string;
      teamId: string | null;
      norm: (typeof validRecords)[0]['normalized'];
      isUpdate: boolean;
      currentServerVersion: number;
    }> = [];

    for (const item of validRecords) {
      const idx = item.index;
      const rec = item.record;
      const norm = item.normalized;
      const household = householdMap.get(norm.householdId);

      // Check household existence
      if (!household) {
        results[idx] = {
          id: rec.id,
          status: 'forbidden',
          code: 'HOUSEHOLD_NOT_FOUND',
          message: 'Target household not found',
        };
        continue;
      }

      // Check soft-deleted household (§8.3 forbidden)
      if (household.deletedAt) {
        results[idx] = {
          id: rec.id,
          status: 'forbidden',
          code: 'HOUSEHOLD_DELETED',
          message: 'Target household has been deleted and cannot accept client records',
        };
        continue;
      }

      // Check caller scope per role (§8.3 & Blueprint §10.3)
      if (user.role === 'team_member' || user.role === 'cdc_secretary') {
        // Level 4 (secretary) and Level 5 (agent): strictly own team's households
        if (!user.teamId || household.teamId !== user.teamId) {
          results[idx] = {
            id: rec.id,
            status: 'forbidden',
            code: 'HOUSEHOLD_OUT_OF_SCOPE',
            message: 'Household is outside caller team scope',
          };
          continue;
        }
      } else if (user.role === 'sda') {
        // Level 3 (sda): divisional scope
        if (!user.dsId || household.dsId !== user.dsId) {
          results[idx] = {
            id: rec.id,
            status: 'forbidden',
            code: 'HOUSEHOLD_OUT_OF_SCOPE',
            message: 'Household is outside caller DS division scope',
          };
          continue;
        }
      } else if (user.role === 'dc') {
        // Level 2 (dc): district scope
        if (!user.districtId || household.districtId !== user.districtId) {
          results[idx] = {
            id: rec.id,
            status: 'forbidden',
            code: 'HOUSEHOLD_OUT_OF_SCOPE',
            message: 'Household is outside caller district scope',
          };
          continue;
        }
      } else if (
        user.role === 'super_admin' ||
        user.role === 'admin' ||
        user.role === 'cg'
      ) {
        // Levels 00, 0, 1: National scope (any non-deleted household)
      } else {
        results[idx] = {
          id: rec.id,
          status: 'forbidden',
          code: 'ROLE_UNAUTHORIZED',
          message: 'Role not authorized to push client records',
        };
        continue;
      }

      // Check existing client row
      const existing = existingMap.get(rec.id);
      if (existing) {
        // Never overwrite someone else's record (§8.3 #3)
        if (existing.collectedBy !== user.userId) {
          results[idx] = {
            id: rec.id,
            status: 'forbidden',
            code: 'RECORD_OWNED_BY_ANOTHER_USER',
            message: 'Client survey belongs to another agent',
          };
          continue;
        }

        // Retry after lost response (same content hash) -> return ok with existing server version
        if (existing.contentHash === norm.contentHash) {
          results[idx] = {
            id: rec.id,
            status: 'ok',
            server_version: existing.serverVersion,
          };
          continue;
        }

        // Different content: if caller is Level 5 and base_version >= 1 -> locked (Decision C2)
        if (user.role === 'team_member' && (rec.base_version ?? 0) >= 1) {
          results[idx] = {
            id: rec.id,
            status: 'locked',
            code: 'RECORD_LOCKED',
            message: 'Confirmed records cannot be modified by Level 5 agents',
          };
          continue;
        }

        toUpsert.push({
          index: idx,
          id: rec.id,
          householdId: household.id,
          districtId: household.districtId,
          dsId: household.dsId,
          gnId: household.gnId,
          teamId: household.teamId,
          norm,
          isUpdate: true,
          currentServerVersion: existing.serverVersion,
        });
      } else {
        toUpsert.push({
          index: idx,
          id: rec.id,
          householdId: household.id,
          districtId: household.districtId,
          dsId: household.dsId,
          gnId: household.gnId,
          teamId: household.teamId,
          norm,
          isUpdate: false,
          currentServerVersion: 0,
        });
      }
    }

    // --- STEP 4: Query 3 — Single Bulk Upsert with ON CONFLICT DO UPDATE ---
    if (toUpsert.length > 0) {
      const now = new Date();
      const valuePlaceholders: string[] = [];
      const queryParams: any[] = [];
      let pIdx = 1;

      for (const u of toUpsert) {
        const norm = u.norm;
        valuePlaceholders.push(`(
          $${pIdx++}::uuid,
          $${pIdx++}::uuid,
          $${pIdx++}::uuid,
          $${pIdx++}::uuid,
          $${pIdx++}::uuid,
          ${u.teamId ? `$${pIdx++}::uuid` : `NULL::uuid`},
          $${pIdx++},
          $${pIdx++},
          $${pIdx++}::integer,
          $${pIdx++}::"gender",
          $${pIdx++},
          $${pIdx++},
          $${pIdx++},
          $${pIdx++},
          $${pIdx++},
          $${pIdx++},
          $${pIdx++},
          $${pIdx++},
          $${pIdx++},
          $${pIdx++}::boolean,
          $${pIdx++}::boolean,
          $${pIdx++}::boolean,
          $${pIdx++}::boolean,
          $${pIdx++}::boolean,
          $${pIdx++}::text[],
          $${pIdx++}::"info_provided_by",
          $${pIdx++},
          $${pIdx++}::boolean,
          $${pIdx++}::timestamptz,
          $${pIdx++},
          $${pIdx++}::uuid,
          $${pIdx++}::timestamptz,
          $${pIdx++},
          $${pIdx++}::timestamptz,
          $${pIdx++}::integer,
          $${pIdx++},
          $${pIdx++}::timestamptz,
          $${pIdx++},
          $${pIdx++},
          $${pIdx++}::timestamptz,
          $${pIdx++}::uuid,
          $${pIdx++}::uuid
        )`);

        queryParams.push(
          u.id,
          u.householdId,
          u.districtId,
          u.dsId,
          u.gnId,
        );
        if (u.teamId) {
          queryParams.push(u.teamId);
        }
        queryParams.push(
          norm.name,
          norm.nameNorm,
          norm.age,
          norm.gender,
          norm.address,
          norm.phoneRaw,
          norm.phoneE164,
          norm.whatsappRaw,
          norm.whatsappE164,
          norm.highestEducation,
          norm.highestVocational,
          norm.interestedVocationalStream,
          norm.interestedJob,
          norm.isEpf,
          norm.isEtf,
          norm.isAswesuma,
          norm.isSamurdhi,
          norm.hasSpecialNeeds,
          norm.futureHopes,
          norm.infoProvidedBy,
          norm.infoProvidedByOther,
          norm.consentGiven,
          norm.consentAt.toISOString(),
          norm.consentVersion,
          user.userId,
          now.toISOString(),
          dto.device_id,
          norm.clientUpdatedAt.toISOString(),
          u.isUpdate ? u.currentServerVersion + 1 : 1,
          norm.contentHash,
          now.toISOString(),
          dto.app_version,
          String(dto.schema_version ?? 1),
          now.toISOString(),
          user.userId,
          user.userId,
        );
      }

      const bulkSql = `
        WITH upserted AS (
          INSERT INTO clients (
          id, household_id, district_id, ds_id, gn_id, team_id,
          name, name_norm, age, gender, address,
          phone_raw, phone_e164, whatsapp_raw, whatsapp_e164,
          highest_education, highest_vocational, interested_vocational_stream, interested_job,
          is_epf, is_etf, is_aswesuma, is_samurdhi, has_special_needs,
          future_hopes, info_provided_by, info_provided_by_other,
          consent_given, consent_at, consent_version,
          collected_by, collected_at, device_id, client_updated_at,
          server_version, content_hash, received_at, app_version, schema_version,
          synced_at, created_by, updated_by
        )
        VALUES
          ${valuePlaceholders.join(',\n')}
        ON CONFLICT (id) DO UPDATE SET
          household_id = EXCLUDED.household_id,
          district_id = EXCLUDED.district_id,
          ds_id = EXCLUDED.ds_id,
          gn_id = EXCLUDED.gn_id,
          team_id = EXCLUDED.team_id,
          name = EXCLUDED.name,
          name_norm = EXCLUDED.name_norm,
          age = EXCLUDED.age,
          gender = EXCLUDED.gender,
          address = EXCLUDED.address,
          phone_raw = EXCLUDED.phone_raw,
          phone_e164 = EXCLUDED.phone_e164,
          whatsapp_raw = EXCLUDED.whatsapp_raw,
          whatsapp_e164 = EXCLUDED.whatsapp_e164,
          highest_education = EXCLUDED.highest_education,
          highest_vocational = EXCLUDED.highest_vocational,
          interested_vocational_stream = EXCLUDED.interested_vocational_stream,
          interested_job = EXCLUDED.interested_job,
          is_epf = EXCLUDED.is_epf,
          is_etf = EXCLUDED.is_etf,
          is_aswesuma = EXCLUDED.is_aswesuma,
          is_samurdhi = EXCLUDED.is_samurdhi,
          has_special_needs = EXCLUDED.has_special_needs,
          future_hopes = EXCLUDED.future_hopes,
          info_provided_by = EXCLUDED.info_provided_by,
          info_provided_by_other = EXCLUDED.info_provided_by_other,
          consent_given = EXCLUDED.consent_given,
          consent_at = EXCLUDED.consent_at,
          consent_version = EXCLUDED.consent_version,
          client_updated_at = EXCLUDED.client_updated_at,
          server_version = clients.server_version + 1,
          content_hash = EXCLUDED.content_hash,
          synced_at = EXCLUDED.synced_at,
          updated_by = EXCLUDED.updated_by
        WHERE clients.collected_by = EXCLUDED.collected_by
        RETURNING id, server_version, team_id
      ),
      updated_teams AS (
        UPDATE teams
        SET stats_dirty_at = $${pIdx++}::timestamptz
        WHERE id IN (
          SELECT DISTINCT team_id FROM upserted WHERE team_id IS NOT NULL
        )
        RETURNING id
      )
      SELECT id, server_version FROM upserted;
      `;

      queryParams.push(now.toISOString());

      try {
        const returnedRows = await this.prisma.$queryRawUnsafe<
          Array<{ id: string; server_version: number }>
        >(bulkSql, ...queryParams);

        const returnedMap = new Map<string, number>(
          returnedRows.map((r) => [r.id, r.server_version]),
        );

        for (const item of toUpsert) {
          const version = returnedMap.get(item.id);
          if (version !== undefined) {
            results[item.index] = {
              id: item.id,
              status: 'ok',
              server_version: version,
            };
          } else {
            // Missing from RETURNING means lost race against another collector
            results[item.index] = {
              id: item.id,
              status: 'forbidden',
              code: 'RACE_CONFLICT',
              message: 'Record updated by another user concurrently',
            };
          }
        }
      } catch (err: any) {
        this.logger.error(`Bulk upsert query failed: ${err.message}`, err.stack);
        throw err;
      }
    }

    return { results };
  }
}
