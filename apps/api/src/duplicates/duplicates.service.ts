import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DuplicateStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope/scope.service';
import { ScopeContext, UserRole } from '../common/scope/scope.types';
import {
  DUPLICATE_THRESHOLDS,
  DuplicateScoringInput,
  classifyDuplicateScore,
  scoreDuplicatePair,
} from './duplicate-scoring';
import {
  ConfirmDuplicateDto,
  DismissDuplicateDto,
  DuplicateClassificationFilter,
  DuplicateFilterStatus,
  ListDuplicatesDto,
} from './dto/duplicate.dto';

interface CandidateClientRow {
  id: string;
  household_id: string;
  gn_id: string;
  name: string;
  name_norm: string;
  age: number;
  gender: string;
  phone_e164: string | null;
  whatsapp_e164: string | null;
}

@Injectable()
export class DuplicatesService {
  private readonly logger = new Logger(DuplicatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: ScopeService,
  ) { }

  /**
   * Builds client-level scope predicate enforced against at least one side of the duplicate pair.
   * Level 5 (team_member) has zero access to duplicate review queues (§6.2 / Role Matrix).
   */
  private getClientScopeForDuplicates(
    caller: ScopeContext,
    query: ListDuplicatesDto,
  ): { scopeClientWhere: Record<string, any>; queryClientWhere: Record<string, any> } {
    if (caller.role === UserRole.team_member) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: 'Enumerators do not have access to duplicate review queues',
      });
    }

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
          message: 'Cannot inspect duplicates outside assigned team',
        });
      }
    } else if (caller.role === UserRole.sda) {
      if (query.dsId && query.dsId !== caller.dsId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_SCOPE',
          message: 'Cannot inspect duplicates outside assigned DS division',
        });
      }
    } else if (caller.role === UserRole.dc) {
      if (query.districtId && query.districtId !== caller.districtId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_SCOPE',
          message: 'Cannot inspect duplicates outside assigned district',
        });
      }
    }

    const baseScope = this.scopeService.getClientScopeFilter(caller);
    const scopeClientWhere =
      Object.keys(baseScope).length > 0 ? baseScope : { deletedAt: null };

    const queryClientWhere: Record<string, any> = {};
    if (query.districtId) queryClientWhere.districtId = query.districtId;
    if (query.dsId) queryClientWhere.dsId = query.dsId;
    if (query.gnId) queryClientWhere.gnId = query.gnId;
    if (query.teamId) queryClientWhere.teamId = query.teamId;

    return { scopeClientWhere, queryClientWhere };
  }

  /**
   * Lists duplicate candidates within caller scope using keyset cursor pagination (zero OFFSET).
   */
  async listDuplicates(caller: ScopeContext, query: ListDuplicatesDto) {
    const { scopeClientWhere, queryClientWhere } =
      this.getClientScopeForDuplicates(caller, query);

    const scopePairFilter: Record<string, any> = {
      OR: [
        { clientARecord: scopeClientWhere },
        { clientBRecord: scopeClientWhere },
      ],
    };

    const userAreaPairFilter: Record<string, any> | undefined =
      Object.keys(queryClientWhere).length > 0
        ? {
          OR: [
            { clientARecord: queryClientWhere },
            { clientBRecord: queryClientWhere },
          ],
        }
        : undefined;

    const statusFilter: Record<string, any> | undefined =
      query.status && query.status !== DuplicateFilterStatus.all
        ? { status: query.status as DuplicateStatus }
        : undefined;

    let scoreCondition: Record<string, any> | undefined;
    const minScore = query.minScore ?? 0;
    if (query.classification === DuplicateClassificationFilter.probable) {
      scoreCondition = {
        score: { gte: Math.max(minScore, DUPLICATE_THRESHOLDS.probable) },
      };
    } else if (query.classification === DuplicateClassificationFilter.possible) {
      scoreCondition = {
        score: {
          gte: Math.max(minScore, DUPLICATE_THRESHOLDS.possible),
          lt: DUPLICATE_THRESHOLDS.probable,
        },
      };
    } else if (minScore > 0) {
      scoreCondition = { score: { gte: minScore } };
    }

    const where = this.scopeService.combineConditions(
      scopePairFilter,
      userAreaPairFilter,
      statusFilter,
      scoreCondition,
    );

    const openCountWhere = this.scopeService.combineConditions(
      scopePairFilter,
      userAreaPairFilter,
      { status: DuplicateStatus.open },
    );

    const limit = query.limit ?? 50;

    const [rows, openCount] = await Promise.all([
      this.prisma.duplicateCandidate.findMany({
        where,
        take: limit + 1,
        orderBy: [{ score: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        ...(query.cursor && query.cursor.trim().length > 0
          ? { cursor: { id: query.cursor.trim() }, skip: 1 }
          : {}),
        include: {
          clientARecord: {
            select: {
              id: true,
              name: true,
              nameNorm: true,
              age: true,
              gender: true,
              address: true,
              phoneRaw: true,
              phoneE164: true,
              whatsappRaw: true,
              whatsappE164: true,
              householdId: true,
              gnId: true,
              dsId: true,
              districtId: true,
              teamId: true,
              duplicateOf: true,
              createdAt: true,
              household: {
                select: {
                  id: true,
                  houseNo: true,
                  serialNo: true,
                  gnId: true,
                },
              },
            },
          },
          clientBRecord: {
            select: {
              id: true,
              name: true,
              nameNorm: true,
              age: true,
              gender: true,
              address: true,
              phoneRaw: true,
              phoneE164: true,
              whatsappRaw: true,
              whatsappE164: true,
              householdId: true,
              gnId: true,
              dsId: true,
              districtId: true,
              teamId: true,
              duplicateOf: true,
              createdAt: true,
              household: {
                select: {
                  id: true,
                  houseNo: true,
                  serialNo: true,
                  gnId: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.duplicateCandidate.count({ where: openCountWhere }),
    ]);

    let nextCursor: string | undefined;
    if (rows.length > limit) {
      rows.pop();
      nextCursor = rows[rows.length - 1]?.id;
    }

    const items = rows.map((row) => ({
      ...row,
      classification: classifyDuplicateScore(row.score),
    }));

    return {
      items,
      openCount,
      nextCursor,
    };
  }

  /**
   * Post-commit duplicate scoring job triggered after sync/push or client creation/update (§8.3 #6, M6.2).
   * Uses indexed lookups (phone_e164, whatsapp_e164, household_id, pg_trgm gn_id + name_norm).
   */
  async scoreCommittedClients(clientIds: string[]): Promise<number> {
    const uniqueIds = Array.from(new Set(clientIds.filter(Boolean)));
    if (uniqueIds.length === 0) return 0;

    const targets = await this.prisma.client.findMany({
      where: {
        id: { in: uniqueIds },
        deletedAt: null,
        duplicateOf: null,
      },
      select: {
        id: true,
        householdId: true,
        gnId: true,
        name: true,
        nameNorm: true,
        age: true,
        gender: true,
        phoneE164: true,
        whatsappE164: true,
      },
    });

    if (targets.length === 0) return 0;

    const phones = Array.from(
      new Set(
        targets
          .flatMap((t) => [t.phoneE164, t.whatsappE164])
          .filter((p): p is string => Boolean(p && p.trim().length > 0)),
      ),
    );
    const householdIds = Array.from(new Set(targets.map((t) => t.householdId)));

    // Unique (gnId, nameNorm) keys so batched records with identical names only issue 1 GIN query
    const gnNameKeys = new Map<string, { gnId: string; nameNorm: string }>();
    for (const t of targets) {
      if (t.gnId && t.nameNorm && t.nameNorm.trim().length >= 2) {
        gnNameKeys.set(`${t.gnId}::${t.nameNorm}`, {
          gnId: t.gnId,
          nameNorm: t.nameNorm,
        });
      }
    }

    const candidateQueries: Array<Promise<CandidateClientRow[]>> = [];

    if (phones.length > 0) {
      candidateQueries.push(
        this.prisma.$queryRawUnsafe<CandidateClientRow[]>(
          `SELECT id, household_id, gn_id, name, name_norm, age, gender, phone_e164, whatsapp_e164
           FROM "clients"
           WHERE "deleted_at" IS NULL AND "duplicate_of" IS NULL AND "phone_e164" = ANY($1::varchar[])
           UNION
           SELECT id, household_id, gn_id, name, name_norm, age, gender, phone_e164, whatsapp_e164
           FROM "clients"
           WHERE "deleted_at" IS NULL AND "duplicate_of" IS NULL AND "whatsapp_e164" = ANY($1::varchar[])`,
          phones,
        ),
      );
    }

    if (householdIds.length > 0) {
      candidateQueries.push(
        this.prisma.$queryRawUnsafe<CandidateClientRow[]>(
          `SELECT id, household_id, gn_id, name, name_norm, age, gender, phone_e164, whatsapp_e164
           FROM "clients"
           WHERE "household_id" = ANY($1::uuid[])
             AND "deleted_at" IS NULL
             AND "duplicate_of" IS NULL`,
          householdIds,
        ),
      );
    }

    for (const { gnId, nameNorm } of gnNameKeys.values()) {
      candidateQueries.push(
        this.prisma.$queryRawUnsafe<CandidateClientRow[]>(
          `SELECT id, household_id, gn_id, name, name_norm, age, gender, phone_e164, whatsapp_e164
           FROM "clients"
           WHERE "gn_id" = $1::uuid
             AND "deleted_at" IS NULL
             AND "duplicate_of" IS NULL
             AND "name_norm" % $2::varchar
           LIMIT 50`,
          gnId,
          nameNorm,
        ),
      );
    }

    const candidateBatches = await Promise.all(candidateQueries);
    const pool = new Map<string, DuplicateScoringInput>();

    for (const t of targets) {
      pool.set(t.id, {
        id: t.id,
        householdId: t.householdId,
        gnId: t.gnId,
        name: t.name,
        nameNorm: t.nameNorm,
        age: t.age,
        gender: t.gender,
        phone: t.phoneE164,
        whatsapp: t.whatsappE164,
      });
    }

    for (const batch of candidateBatches) {
      if (!Array.isArray(batch)) continue;
      for (const row of batch) {
        if (!pool.has(row.id)) {
          pool.set(row.id, {
            id: row.id,
            householdId: row.household_id,
            gnId: row.gn_id,
            name: row.name,
            nameNorm: row.name_norm,
            age: row.age,
            gender: row.gender,
            phone: row.phone_e164,
            whatsapp: row.whatsapp_e164,
          });
        }
      }
    }

    const allCandidates = Array.from(pool.values());
    const pairsToUpsert = new Map<
      string,
      {
        clientA: string;
        clientB: string;
        score: number;
        reasonsJson: string;
      }
    >();

    for (const t of targets) {
      const targetInput = pool.get(t.id)!;
      for (const other of allCandidates) {
        if (!other.id || other.id === t.id) continue;
        // Narrow comparison window cleanly: only pair records that actually share
        // phone/whatsapp, household, or GN (cross-GN requires exact same phone)
        const scored = scoreDuplicatePair(targetInput, other);
        if (scored.score < DUPLICATE_THRESHOLDS.possible) continue;

        const [clientA, clientB] =
          t.id < other.id ? [t.id, other.id] : [other.id, t.id];
        const pairKey = `${clientA}:${clientB}`;
        if (!pairsToUpsert.has(pairKey)) {
          pairsToUpsert.set(pairKey, {
            clientA,
            clientB,
            score: scored.score,
            reasonsJson: JSON.stringify(scored.reasons),
          });
        }
      }
    }

    if (pairsToUpsert.size === 0) return 0;

    const pairs = Array.from(pairsToUpsert.values());
    const valuesClauses: string[] = [];
    const params: any[] = [];
    pairs.forEach((p, idx) => {
      const base = idx * 4;
      valuesClauses.push(
        `($${base + 1}::uuid, $${base + 2}::uuid, $${base + 3}::int, $${base + 4}::jsonb, 'open')`,
      );
      params.push(p.clientA, p.clientB, p.score, p.reasonsJson);
    });

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "duplicate_candidates" ("client_a", "client_b", "score", "reasons", "status")
       VALUES ${valuesClauses.join(', ')}
       ON CONFLICT ("client_a", "client_b") DO UPDATE SET
         "score" = EXCLUDED."score",
         "reasons" = EXCLUDED."reasons"
       WHERE "duplicate_candidates"."status" = 'open'`,
      ...params,
    );

    return pairs.length;
  }

  /**
   * Confirms a duplicate candidate pair (L4 CDC Secretary for own team, or L00 Super Admin).
   * Sets clients.duplicate_of without deleting records, writes audit trail, and marks team stats dirty.
   */
  async confirmDuplicate(
    caller: ScopeContext,
    candidateId: string,
    dto: ConfirmDuplicateDto,
  ) {
    if (
      caller.role !== UserRole.cdc_secretary &&
      caller.role !== UserRole.super_admin
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: 'Only CDC Secretaries and Super Admins can confirm duplicates',
      });
    }

    const candidate = await this.prisma.duplicateCandidate.findUnique({
      where: { id: candidateId },
      include: {
        clientARecord: true,
        clientBRecord: true,
      },
    });

    if (!candidate) {
      throw new NotFoundException({
        code: 'DUPLICATE_NOT_FOUND',
        message: 'Duplicate candidate not found',
      });
    }

    const recordA = candidate.clientARecord;
    const recordB = candidate.clientBRecord;
    if (!recordA || !recordB) {
      throw new NotFoundException({
        code: 'CLIENT_NOT_FOUND',
        message: 'Associated client record not found',
      });
    }

    if (caller.role === UserRole.cdc_secretary) {
      if (
        !caller.teamId ||
        (recordA.teamId !== caller.teamId && recordB.teamId !== caller.teamId)
      ) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_TEAM',
          message:
            'CDC Secretary can only resolve duplicate candidates within their assigned team',
        });
      }
    }

    let canonicalClientId = dto.canonicalClientId;
    if (canonicalClientId) {
      if (
        canonicalClientId !== candidate.clientA &&
        canonicalClientId !== candidate.clientB
      ) {
        throw new BadRequestException({
          code: 'INVALID_CANONICAL_CLIENT',
          message:
            'canonicalClientId must be either clientA or clientB of this candidate pair',
        });
      }
    } else {
      // Default to whichever record is not already marked duplicate, else earlier createdAt
      if (recordA.duplicateOf && !recordB.duplicateOf) {
        canonicalClientId = recordB.id;
      } else if (recordB.duplicateOf && !recordA.duplicateOf) {
        canonicalClientId = recordA.id;
      } else {
        canonicalClientId =
          recordA.createdAt <= recordB.createdAt ? recordA.id : recordB.id;
      }
    }

    const duplicateClientId =
      canonicalClientId === recordA.id ? recordB.id : recordA.id;
    const duplicateRecord =
      duplicateClientId === recordA.id ? recordA : recordB;

    if (
      caller.role === UserRole.cdc_secretary &&
      duplicateRecord.teamId !== caller.teamId
    ) {
      throw new ForbiddenException({
        code: 'OUT_OF_SCOPE_TEAM',
        message:
          'CDC Secretary cannot mark a client belonging to another team as duplicate',
      });
    }

    const now = new Date();
    const auditReason =
      dto.reason?.trim() ||
      `Duplicate confirmed against canonical client ${canonicalClientId} (candidate ${candidate.id})`;

    return this.prisma.$transaction(async (tx) => {
      const updatedDuplicateClient = await tx.client.update({
        where: { id: duplicateClientId },
        data: {
          duplicateOf: canonicalClientId,
          updatedBy: caller.userId,
        },
      });

      await tx.clientAudit.create({
        data: {
          clientId: duplicateClientId,
          changedBy: caller.userId,
          before: duplicateRecord as any,
          after: updatedDuplicateClient as any,
          reason: auditReason.slice(0, 255),
        },
      });

      const updatedCandidate = await tx.duplicateCandidate.update({
        where: { id: candidateId },
        data: {
          status: DuplicateStatus.confirmed,
          reviewedBy: caller.userId,
          reviewedAt: now,
        },
      });

      const dirtyTeamIds = Array.from(
        new Set(
          [recordA.teamId, recordB.teamId].filter((id): id is string =>
            Boolean(id),
          ),
        ),
      );
      if (dirtyTeamIds.length > 0) {
        await tx.team.updateMany({
          where: { id: { in: dirtyTeamIds } },
          data: { statsDirtyAt: now },
        });
      }

      this.logger.log(
        `Duplicate candidate ${candidateId} confirmed (${duplicateClientId} -> ${canonicalClientId}) by ${caller.userId}`,
      );

      return {
        ...updatedCandidate,
        canonicalClientId,
        duplicateClientId,
      };
    });
  }

  /**
   * Dismisses a duplicate candidate pair (L4 CDC Secretary for own team, or L00 Super Admin).
   */
  async dismissDuplicate(
    caller: ScopeContext,
    candidateId: string,
    dto: DismissDuplicateDto,
  ) {
    if (
      caller.role !== UserRole.cdc_secretary &&
      caller.role !== UserRole.super_admin
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: 'Only CDC Secretaries and Super Admins can dismiss duplicates',
      });
    }

    const candidate = await this.prisma.duplicateCandidate.findUnique({
      where: { id: candidateId },
      include: {
        clientARecord: { select: { id: true, teamId: true } },
        clientBRecord: { select: { id: true, teamId: true } },
      },
    });

    if (!candidate) {
      throw new NotFoundException({
        code: 'DUPLICATE_NOT_FOUND',
        message: 'Duplicate candidate not found',
      });
    }

    if (caller.role === UserRole.cdc_secretary) {
      if (
        !caller.teamId ||
        (candidate.clientARecord?.teamId !== caller.teamId &&
          candidate.clientBRecord?.teamId !== caller.teamId)
      ) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE_TEAM',
          message:
            'CDC Secretary can only dismiss duplicate candidates within their assigned team',
        });
      }
    }

    const now = new Date();
    const existingReasons =
      candidate.reasons && typeof candidate.reasons === 'object'
        ? (candidate.reasons as Record<string, any>)
        : {};

    const updated = await this.prisma.duplicateCandidate.update({
      where: { id: candidateId },
      data: {
        status: DuplicateStatus.dismissed,
        reviewedBy: caller.userId,
        reviewedAt: now,
        ...(dto.reason?.trim()
          ? {
            reasons: {
              ...existingReasons,
              dismissReason: dto.reason.trim().slice(0, 255),
            },
          }
          : {}),
      },
    });

    this.logger.log(
      `Duplicate candidate ${candidateId} dismissed by ${caller.userId}`,
    );

    return updated;
  }
}
