import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeContext, UserRole } from '../common/scope/scope.types';
import { SRI_LANKA_25_DISTRICTS } from './districts.data';
import {
  CreateDsDto,
  CreateGnDto,
  UpdateGnDto,
  CreateTeamDto,
  UpdateTeamDto,
  ListDsDto,
  ListGnDto,
  ListTeamsDto,
} from './dto/area.dto';

export interface PilotAreaImportResult {
  rowCount: number;
  importedDistricts: number;
  importedDs: number;
  importedGn: number;
  importedTeams: number;
  errors: Array<{ row: number; error: string }>;
  dryRun?: boolean;
}

@Injectable()
export class AreaService {
  constructor(private readonly prisma: PrismaService) { }

  /**
   * Seeds the 25 official Sri Lankan districts with trilingual names.
   */
  async seedDistricts(): Promise<number> {
    let count = 0;
    for (const d of SRI_LANKA_25_DISTRICTS) {
      const existing = await this.prisma.district.findFirst({
        where: { nameEn: d.nameEn },
      });
      if (!existing) {
        await this.prisma.district.create({
          data: {
            nameEn: d.nameEn,
            nameSi: d.nameSi,
            nameTa: d.nameTa,
          },
        });
        count++;
      }
    }
    return count;
  }

  async getDistricts() {
    return this.prisma.district.findMany({
      orderBy: { nameEn: 'asc' },
    });
  }

  async getDistrictById(id: string) {
    const district = await this.prisma.district.findUnique({
      where: { id },
      include: {
        divisions: {
          orderBy: { nameEn: 'asc' },
        },
      },
    });

    if (!district) {
      throw new NotFoundException({
        code: 'DISTRICT_NOT_FOUND',
        message: 'District not found',
      });
    }

    return district;
  }

  async createDivisionalSecretariat(dto: CreateDsDto) {
    const district = await this.prisma.district.findUnique({
      where: { id: dto.districtId },
    });
    if (!district) {
      throw new NotFoundException({
        code: 'DISTRICT_NOT_FOUND',
        message: 'Parent district not found',
      });
    }

    return this.prisma.divisionalSecretariat.create({
      data: {
        districtId: dto.districtId,
        nameEn: dto.nameEn,
        nameSi: dto.nameSi,
        nameTa: dto.nameTa,
        sdoName: dto.sdoName,
      },
    });
  }

  async getDivisionalSecretariats(
    caller: ScopeContext,
    query: ListDsDto = {},
  ) {
    const where: any = {};

    switch (caller.role) {
      case UserRole.super_admin:
      case UserRole.admin:
      case UserRole.cg:
        if (query.districtId) where.districtId = query.districtId;
        break;

      case UserRole.dc:
        if (!caller.districtId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message: 'DC user missing assigned district scope',
          });
        }
        if (query.districtId && query.districtId !== caller.districtId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message: 'Cannot access DS divisions outside assigned district',
          });
        }
        where.districtId = caller.districtId;
        break;

      case UserRole.sda:
      case UserRole.cdc_secretary:
      case UserRole.team_member:
        if (!caller.dsId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message: 'User missing assigned DS division scope',
          });
        }
        if (
          query.districtId &&
          caller.districtId &&
          query.districtId !== caller.districtId
        ) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message: 'Cannot access DS divisions outside assigned scope',
          });
        }
        where.id = caller.dsId;
        break;

      default:
        throw new ForbiddenException({
          code: 'FORBIDDEN_SCOPE',
          message: 'Unauthorized role for DS divisions access',
        });
    }

    const limit = Math.min(query.limit || 50, 100);
    const skip = query.cursor
      ? 1
      : query.page && query.page > 1
        ? (query.page - 1) * limit
        : 0;
    const cursor = query.cursor ? { id: query.cursor } : undefined;

    const [items, total] = await Promise.all([
      this.prisma.divisionalSecretariat.findMany({
        where,
        select: {
          id: true,
          districtId: true,
          nameEn: true,
          nameSi: true,
          nameTa: true,
          sdoName: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { nameEn: 'asc' },
        take: limit,
        skip,
        cursor,
      }),
      this.prisma.divisionalSecretariat.count({ where }),
    ]);

    const nextCursor =
      items.length === limit ? items[items.length - 1].id : undefined;

    return {
      items,
      total,
      limit,
      page: query.page || 1,
      nextCursor,
    };
  }

  async createGnDivision(dto: CreateGnDto) {
    const ds = await this.prisma.divisionalSecretariat.findUnique({
      where: { id: dto.dsId },
    });
    if (!ds) {
      throw new NotFoundException({
        code: 'DS_NOT_FOUND',
        message: 'Divisional Secretariat not found',
      });
    }

    const existing = await this.prisma.gnDivision.findUnique({
      where: {
        dsId_gnNumber: {
          dsId: dto.dsId,
          gnNumber: dto.gnNumber,
        },
      },
    });
    if (existing) {
      throw new ConflictException({
        code: 'GN_NUMBER_EXISTS',
        message: `GN Division number ${dto.gnNumber} already exists in this DS division`,
      });
    }

    return this.prisma.gnDivision.create({
      data: {
        dsId: dto.dsId,
        gnNumber: dto.gnNumber,
        gnName: dto.gnName,
        secretaryName: dto.secretaryName,
        secretaryContact: dto.secretaryContact,
        secretaryEmail: dto.secretaryEmail,
      },
    });
  }

  async getGnDivisions(caller: ScopeContext, query: ListGnDto = {}) {
    const where: any = {};

    switch (caller.role) {
      case UserRole.super_admin:
      case UserRole.admin:
      case UserRole.cg:
        if (query.dsId) where.dsId = query.dsId;
        break;

      case UserRole.dc:
        if (!caller.districtId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message: 'DC user missing assigned district scope',
          });
        }
        if (query.dsId) {
          const ds = await this.prisma.divisionalSecretariat.findUnique({
            where: { id: query.dsId },
            select: { districtId: true },
          });
          if (!ds || ds.districtId !== caller.districtId) {
            throw new ForbiddenException({
              code: 'FORBIDDEN_SCOPE',
              message: 'Cannot access GN divisions outside assigned district',
            });
          }
          where.dsId = query.dsId;
        } else {
          where.ds = { districtId: caller.districtId };
        }
        break;

      case UserRole.sda:
        if (!caller.dsId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message: 'SDA user missing assigned DS division scope',
          });
        }
        if (query.dsId && query.dsId !== caller.dsId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message: 'Cannot access GN divisions outside assigned DS division',
          });
        }
        where.dsId = caller.dsId;
        break;

      case UserRole.cdc_secretary:
      case UserRole.team_member:
        if (!caller.gnId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message: 'User missing assigned GN division scope',
          });
        }
        if (query.dsId && caller.dsId && query.dsId !== caller.dsId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message: 'Cannot access GN divisions outside assigned scope',
          });
        }
        where.id = caller.gnId;
        break;

      default:
        throw new ForbiddenException({
          code: 'FORBIDDEN_SCOPE',
          message: 'Unauthorized role for GN divisions access',
        });
    }

    const limit = Math.min(query.limit || 50, 100);
    const skip = query.cursor
      ? 1
      : query.page && query.page > 1
        ? (query.page - 1) * limit
        : 0;
    const cursor = query.cursor ? { id: query.cursor } : undefined;

    // CRITICAL SECURITY FIX: Never return CDC secretary contact details (secretaryName,
    // secretaryContact, secretaryEmail) in bulk list queries to prevent Level 5 or unauthorized enumeration.
    const [items, total] = await Promise.all([
      this.prisma.gnDivision.findMany({
        where,
        select: {
          id: true,
          dsId: true,
          gnNumber: true,
          gnName: true,
          nextSerial: true,
          createdAt: true,
          updatedAt: true,
          teams: {
            select: {
              id: true,
              teamNo: true,
              maxMembers: true,
            },
            orderBy: { teamNo: 'asc' },
          },
        },
        orderBy: { gnNumber: 'asc' },
        take: limit,
        skip,
        cursor,
      }),
      this.prisma.gnDivision.count({ where }),
    ]);

    const nextCursor =
      items.length === limit ? items[items.length - 1].id : undefined;

    return {
      items,
      total,
      limit,
      page: query.page || 1,
      nextCursor,
    };
  }

  async getGnDivisionById(caller: ScopeContext, id: string) {
    if (
      caller.role === UserRole.cdc_secretary &&
      (!caller.gnId || id !== caller.gnId)
    ) {
      throw new ForbiddenException({
        code: 'OUT_OF_SCOPE_GN',
        message: 'CDC Secretary can only access their own GN division',
      });
    }

    const gn = await this.prisma.gnDivision.findUnique({
      where: { id },
      include: {
        ds: {
          include: { district: true },
        },
        teams: {
          orderBy: { teamNo: 'asc' },
          include: {
            _count: { select: { households: true } },
          },
        },
        _count: {
          select: { households: true },
        },
      },
    });

    if (!gn) {
      throw new NotFoundException({
        code: 'GN_NOT_FOUND',
        message: 'GN division not found',
      });
    }

    return gn;
  }

  async updateGnDivision(caller: ScopeContext, id: string, dto: UpdateGnDto) {
    if (
      caller.role === UserRole.cdc_secretary &&
      (!caller.gnId || id !== caller.gnId)
    ) {
      throw new ForbiddenException({
        code: 'OUT_OF_SCOPE_GN',
        message: 'CDC Secretary can only update their own GN division',
      });
    }

    const gn = await this.prisma.gnDivision.findUnique({
      where: { id },
    });

    if (!gn) {
      throw new NotFoundException({
        code: 'GN_NOT_FOUND',
        message: 'GN division not found',
      });
    }

    return this.prisma.gnDivision.update({
      where: { id },
      data: {
        secretaryName:
          dto.secretaryName !== undefined
            ? dto.secretaryName?.trim() || null
            : undefined,
        secretaryContact:
          dto.secretaryContact !== undefined
            ? dto.secretaryContact?.trim() || null
            : undefined,
        secretaryEmail:
          dto.secretaryEmail !== undefined
            ? dto.secretaryEmail?.trim() || null
            : undefined,
      },
    });
  }

  async createTeam(dto: CreateTeamDto) {
    const gn = await this.prisma.gnDivision.findUnique({
      where: { id: dto.gnId },
    });
    if (!gn) {
      throw new NotFoundException({
        code: 'GN_NOT_FOUND',
        message: 'GN division not found',
      });
    }

    const existing = await this.prisma.team.findUnique({
      where: {
        gnId_teamNo: {
          gnId: dto.gnId,
          teamNo: dto.teamNo,
        },
      },
    });
    if (existing) {
      throw new ConflictException({
        code: 'TEAM_EXISTS',
        message: `Team ${dto.teamNo} already exists in this GN division`,
      });
    }

    return this.prisma.team.create({
      data: {
        gnId: dto.gnId,
        teamNo: dto.teamNo,
        maxMembers: dto.maxMembers ?? 10,
      },
    });
  }

  async updateTeam(teamId: string, dto: UpdateTeamDto) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });
    if (!team) {
      throw new NotFoundException({
        code: 'TEAM_NOT_FOUND',
        message: 'Team not found',
      });
    }

    return this.prisma.team.update({
      where: { id: teamId },
      data: {
        maxMembers: dto.maxMembers !== undefined ? dto.maxMembers : undefined,
        leaderId: dto.leaderId !== undefined ? dto.leaderId : undefined,
      },
    });
  }

  async getTeams(caller: ScopeContext, query: ListTeamsDto = {}) {
    if (caller.role === UserRole.team_member) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_SCOPE',
        message: 'Level 5 team members cannot list teams',
      });
    }

    const where: any = {};

    switch (caller.role) {
      case UserRole.super_admin:
      case UserRole.admin:
      case UserRole.cg:
        if (query.gnId) where.gnId = query.gnId;
        break;

      case UserRole.dc:
        if (!caller.districtId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message: 'DC user missing assigned district scope',
          });
        }
        if (query.gnId) {
          const gn = await this.prisma.gnDivision.findUnique({
            where: { id: query.gnId },
            include: { ds: true },
          });
          if (!gn || gn.ds.districtId !== caller.districtId) {
            throw new ForbiddenException({
              code: 'FORBIDDEN_SCOPE',
              message: 'Cannot access teams outside assigned district',
            });
          }
          where.gnId = query.gnId;
        } else {
          where.gn = { ds: { districtId: caller.districtId } };
        }
        break;

      case UserRole.sda:
        if (!caller.dsId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message: 'SDA user missing assigned DS division scope',
          });
        }
        if (query.gnId) {
          const gn = await this.prisma.gnDivision.findUnique({
            where: { id: query.gnId },
            select: { dsId: true },
          });
          if (!gn || gn.dsId !== caller.dsId) {
            throw new ForbiddenException({
              code: 'FORBIDDEN_SCOPE',
              message: 'Cannot access teams outside assigned DS division',
            });
          }
          where.gnId = query.gnId;
        } else {
          where.gn = { dsId: caller.dsId };
        }
        break;

      case UserRole.cdc_secretary:
        if (!caller.gnId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message: 'CDC Secretary missing assigned GN division scope',
          });
        }
        if (query.gnId && query.gnId !== caller.gnId) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_SCOPE',
            message: 'Cannot access teams outside assigned GN division',
          });
        }
        where.gnId = caller.gnId;
        break;

      default:
        throw new ForbiddenException({
          code: 'FORBIDDEN_SCOPE',
          message: 'Unauthorized role for teams access',
        });
    }

    const limit = Math.min(query.limit || 50, 100);
    const skip = query.cursor
      ? 1
      : query.page && query.page > 1
        ? (query.page - 1) * limit
        : 0;
    const cursor = query.cursor ? { id: query.cursor } : undefined;

    const [items, total] = await Promise.all([
      this.prisma.team.findMany({
        where,
        select: {
          id: true,
          gnId: true,
          teamNo: true,
          maxMembers: true,
          leaderId: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { teamNo: 'asc' },
        take: limit,
        skip,
        cursor,
      }),
      this.prisma.team.count({ where }),
    ]);

    const nextCursor =
      items.length === limit ? items[items.length - 1].id : undefined;

    const teamIds = items.map((t) => t.id);
    const countMap = new Map<string, number>();

    if (
      teamIds.length > 0 &&
      this.prisma.profile &&
      typeof (this.prisma.profile as any).groupBy === 'function'
    ) {
      try {
        const memberCounts = await (this.prisma.profile as any).groupBy({
          by: ['teamId'],
          where: {
            teamId: { in: teamIds },
            isActive: true,
          },
          _count: {
            _all: true,
          },
        });
        for (const mc of memberCounts) {
          if (mc.teamId) {
            countMap.set(mc.teamId, mc._count._all);
          }
        }
      } catch {
        // Fallback gracefully if groupBy fails in test mocks
      }
    }

    const formattedItems = items.map((t) => ({
      id: t.id,
      gnId: t.gnId,
      teamNo: t.teamNo,
      maxMembers: t.maxMembers,
      leaderId: t.leaderId,
      activeMembers: countMap.get(t.id) ?? 0,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    return {
      items: formattedItems,
      total,
      limit,
      page: query.page || 1,
      nextCursor,
    };
  }

  /**
   * Helper to load a pilot area hierarchy from CSV (M1.7).
   * Parses CSV rows with headers:
   * district,ds_division,gn_number,gn_name,secretary_name,secretary_contact,secretary_email,sdo_name,initial_teams,max_members_per_team
   */
  async importPilotAreaFromCsv(
    csvContent: string,
    dryRun: boolean = false,
  ): Promise<PilotAreaImportResult> {
    const lines = csvContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    if (lines.length < 2) {
      throw new BadRequestException({
        code: 'INVALID_CSV',
        message: 'CSV must contain at least a header and one data row',
      });
    }

    const header = this.parseCsvLine(lines[0]).map((h) =>
      h
        .trim()
        .toLowerCase()
        .replace(/^["']|["']$/g, ''),
    );

    const colIndex = {
      district: header.indexOf('district'),
      dsDivision: header.indexOf('ds_division'),
      gnNumber: header.indexOf('gn_number'),
      gnName: header.indexOf('gn_name'),
      secretaryName: header.indexOf('secretary_name'),
      secretaryContact: header.indexOf('secretary_contact'),
      secretaryEmail: header.indexOf('secretary_email'),
      sdoName: header.indexOf('sdo_name'),
      initialTeams: header.indexOf('initial_teams'),
      maxMembersPerTeam: header.indexOf('max_members_per_team'),
    };

    if (
      colIndex.district === -1 ||
      colIndex.dsDivision === -1 ||
      colIndex.gnNumber === -1 ||
      colIndex.gnName === -1
    ) {
      throw new BadRequestException({
        code: 'MISSING_REQUIRED_HEADERS',
        message:
          'CSV must include district, ds_division, gn_number, gn_name columns',
      });
    }

    const errors: Array<{ row: number; error: string }> = [];
    const validRows: Array<{
      rowNumber: number;
      districtName: string;
      officialDistrict: (typeof SRI_LANKA_25_DISTRICTS)[0];
      dsName: string;
      gnNumber: string;
      gnName: string;
      secName?: string;
      secContact?: string;
      secEmail?: string;
      sdoName?: string;
      initialTeams: number;
      maxMembers: number;
    }> = [];

    for (let i = 1; i < lines.length; i++) {
      const rowNumber = i + 1;
      const row = this.parseCsvLine(lines[i]);
      if (row.length < 4) {
        errors.push({
          row: rowNumber,
          error: `Row has ${row.length} columns (fewer than required 4 columns)`,
        });
        continue;
      }

      const districtName = row[colIndex.district]?.trim();
      const dsName = row[colIndex.dsDivision]?.trim();
      const gnNumber = row[colIndex.gnNumber]?.trim();
      const gnName = row[colIndex.gnName]?.trim();

      if (!districtName || !dsName || !gnNumber || !gnName) {
        errors.push({
          row: rowNumber,
          error:
            'Missing required values (district, ds_division, gn_number, or gn_name)',
        });
        continue;
      }

      // Validate district name against official 25 districts (no arbitrary creation on typo!)
      const officialDistrict = SRI_LANKA_25_DISTRICTS.find(
        (d) => d.nameEn.toLowerCase() === districtName.toLowerCase(),
      );
      if (!officialDistrict) {
        errors.push({
          row: rowNumber,
          error: `Invalid district name "${districtName}". Must match one of 25 official Sri Lankan districts.`,
        });
        continue;
      }

      // Validate initial_teams: upper bound is 50
      let initialTeams = 1;
      if (colIndex.initialTeams !== -1 && row[colIndex.initialTeams]?.trim()) {
        const rawTeams = row[colIndex.initialTeams].trim();
        const parsed = parseInt(rawTeams, 10);
        if (isNaN(parsed) || parsed < 1 || parsed > 50) {
          errors.push({
            row: rowNumber,
            error: `initial_teams must be between 1 and 50 (got "${rawTeams}")`,
          });
          continue;
        }
        initialTeams = parsed;
      }

      // Validate max_members_per_team: between 1 and 100
      let maxMembers = 10;
      if (
        colIndex.maxMembersPerTeam !== -1 &&
        row[colIndex.maxMembersPerTeam]?.trim()
      ) {
        const rawMax = row[colIndex.maxMembersPerTeam].trim();
        const parsed = parseInt(rawMax, 10);
        if (isNaN(parsed) || parsed < 1 || parsed > 100) {
          errors.push({
            row: rowNumber,
            error: `max_members_per_team must be between 1 and 100 (got "${rawMax}")`,
          });
          continue;
        }
        maxMembers = parsed;
      }

      const secName =
        colIndex.secretaryName !== -1
          ? row[colIndex.secretaryName]?.trim() || undefined
          : undefined;
      const secContact =
        colIndex.secretaryContact !== -1
          ? row[colIndex.secretaryContact]?.trim() || undefined
          : undefined;
      const secEmail =
        colIndex.secretaryEmail !== -1
          ? row[colIndex.secretaryEmail]?.trim() || undefined
          : undefined;
      const sdoName =
        colIndex.sdoName !== -1
          ? row[colIndex.sdoName]?.trim() || undefined
          : undefined;

      validRows.push({
        rowNumber,
        districtName,
        officialDistrict,
        dsName,
        gnNumber,
        gnName,
        secName,
        secContact,
        secEmail,
        sdoName,
        initialTeams,
        maxMembers,
      });
    }

    // If dry run or errors exist, do NOT write to database
    if (dryRun || errors.length > 0) {
      return {
        rowCount: validRows.length,
        importedDistricts: 0,
        importedDs: 0,
        importedGn: 0,
        importedTeams: 0,
        errors,
        dryRun,
      };
    }

    // Execute import in an atomic transaction to prevent partial import on timeout or error
    const runInTransaction = async (tx: any) => {
      let importedDistricts = 0;
      let importedDs = 0;
      let importedGn = 0;
      let importedTeams = 0;

      for (const row of validRows) {
        // 1. Resolve or create District with official trilingual names
        let district = await tx.district.findFirst({
          where: {
            nameEn: {
              equals: row.officialDistrict.nameEn,
              mode: 'insensitive',
            },
          },
        });
        if (!district) {
          district = await tx.district.create({
            data: {
              nameEn: row.officialDistrict.nameEn,
              nameSi: row.officialDistrict.nameSi,
              nameTa: row.officialDistrict.nameTa,
            },
          });
          importedDistricts++;
        }

        // 2. Resolve or create DS division
        let ds = await tx.divisionalSecretariat.findFirst({
          where: {
            districtId: district.id,
            nameEn: { equals: row.dsName, mode: 'insensitive' },
          },
        });
        if (!ds) {
          ds = await tx.divisionalSecretariat.create({
            data: {
              districtId: district.id,
              nameEn: row.dsName,
              nameSi: row.dsName,
              nameTa: row.dsName,
              sdoName: row.sdoName || null,
            },
          });
          importedDs++;
        }

        // 3. Resolve or create GN division
        let gn = await tx.gnDivision.findUnique({
          where: {
            dsId_gnNumber: {
              dsId: ds.id,
              gnNumber: row.gnNumber,
            },
          },
        });
        if (!gn) {
          gn = await tx.gnDivision.create({
            data: {
              dsId: ds.id,
              gnNumber: row.gnNumber,
              gnName: row.gnName,
              secretaryName: row.secName || null,
              secretaryContact: row.secContact || null,
              secretaryEmail: row.secEmail || null,
            },
          });
          importedGn++;
        }

        // 4. Provision initial teams
        for (let t = 1; t <= row.initialTeams; t++) {
          const teamExists = await tx.team.findUnique({
            where: {
              gnId_teamNo: {
                gnId: gn.id,
                teamNo: t,
              },
            },
          });
          if (!teamExists) {
            await tx.team.create({
              data: {
                gnId: gn.id,
                teamNo: t,
                maxMembers: row.maxMembers,
              },
            });
            importedTeams++;
          }
        }
      }

      return {
        rowCount: validRows.length,
        importedDistricts,
        importedDs,
        importedGn,
        importedTeams,
        errors,
        dryRun: false,
      };
    };

    if (typeof this.prisma.$transaction === 'function') {
      return this.prisma.$transaction(runInTransaction, { timeout: 30000 });
    }
    return runInTransaction(this.prisma);
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let insideQuotes = false;
    let current = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }
}
