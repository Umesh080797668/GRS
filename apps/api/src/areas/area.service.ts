import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SRI_LANKA_25_DISTRICTS } from './districts.data';
import {
  CreateDsDto,
  CreateGnDto,
  CreateTeamDto,
  UpdateTeamDto,
} from './dto/area.dto';

export interface PilotAreaImportResult {
  rowCount: number;
  importedDistricts: number;
  importedDs: number;
  importedGn: number;
  importedTeams: number;
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

  async getDivisionalSecretariats(districtId?: string) {
    const where = districtId ? { districtId } : {};
    return this.prisma.divisionalSecretariat.findMany({
      where,
      orderBy: { nameEn: 'asc' },
      include: {
        gnDivisions: true,
      },
    });
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

  async getGnDivisions(dsId?: string) {
    const where = dsId ? { dsId } : {};
    return this.prisma.gnDivision.findMany({
      where,
      orderBy: { gnNumber: 'asc' },
      include: {
        teams: {
          orderBy: { teamNo: 'asc' },
        },
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

  async getTeams(gnId?: string) {
    const where = gnId ? { gnId } : {};
    return this.prisma.team.findMany({
      where,
      orderBy: { teamNo: 'asc' },
    });
  }

  /**
   * Helper to load a pilot area hierarchy from CSV (M1.7).
   * Parses CSV rows with headers:
   * district,ds_division,gn_number,gn_name,secretary_name,secretary_contact,secretary_email,sdo_name,initial_teams,max_members_per_team
   */
  async importPilotAreaFromCsv(
    csvContent: string,
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

    const header = lines[0]
      .split(',')
      .map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));

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

    let importedDistricts = 0;
    let importedDs = 0;
    let importedGn = 0;
    let importedTeams = 0;
    let rowCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const row = this.parseCsvLine(lines[i]);
      if (row.length < 4) continue;

      const districtName = row[colIndex.district]?.trim();
      const dsName = row[colIndex.dsDivision]?.trim();
      const gnNumber = row[colIndex.gnNumber]?.trim();
      const gnName = row[colIndex.gnName]?.trim();
      const secName =
        colIndex.secretaryName !== -1
          ? row[colIndex.secretaryName]?.trim()
          : undefined;
      const secContact =
        colIndex.secretaryContact !== -1
          ? row[colIndex.secretaryContact]?.trim()
          : undefined;
      const secEmail =
        colIndex.secretaryEmail !== -1
          ? row[colIndex.secretaryEmail]?.trim()
          : undefined;
      const sdoName =
        colIndex.sdoName !== -1 ? row[colIndex.sdoName]?.trim() : undefined;
      const initialTeams =
        colIndex.initialTeams !== -1
          ? parseInt(row[colIndex.initialTeams]?.trim() || '0', 10)
          : 1;
      const maxMembers =
        colIndex.maxMembersPerTeam !== -1
          ? parseInt(row[colIndex.maxMembersPerTeam]?.trim() || '10', 10)
          : 10;

      if (!districtName || !dsName || !gnNumber || !gnName) continue;
      rowCount++;

      // 1. Resolve or create District
      let district = await this.prisma.district.findFirst({
        where: { nameEn: { equals: districtName, mode: 'insensitive' } },
      });
      if (!district) {
        district = await this.prisma.district.create({
          data: {
            nameEn: districtName,
            nameSi: districtName,
            nameTa: districtName,
          },
        });
        importedDistricts++;
      }

      // 2. Resolve or create DS division
      let ds = await this.prisma.divisionalSecretariat.findFirst({
        where: {
          districtId: district.id,
          nameEn: { equals: dsName, mode: 'insensitive' },
        },
      });
      if (!ds) {
        ds = await this.prisma.divisionalSecretariat.create({
          data: {
            districtId: district.id,
            nameEn: dsName,
            nameSi: dsName,
            nameTa: dsName,
            sdoName: sdoName || null,
          },
        });
        importedDs++;
      }

      // 3. Resolve or create GN division
      let gn = await this.prisma.gnDivision.findUnique({
        where: {
          dsId_gnNumber: {
            dsId: ds.id,
            gnNumber,
          },
        },
      });
      if (!gn) {
        gn = await this.prisma.gnDivision.create({
          data: {
            dsId: ds.id,
            gnNumber,
            gnName,
            secretaryName: secName || null,
            secretaryContact: secContact || null,
            secretaryEmail: secEmail || null,
          },
        });
        importedGn++;
      }

      // 4. Provision initial teams
      const teamCount = isNaN(initialTeams) || initialTeams < 1 ? 1 : initialTeams;
      for (let t = 1; t <= teamCount; t++) {
        const teamExists = await this.prisma.team.findUnique({
          where: {
            gnId_teamNo: {
              gnId: gn.id,
              teamNo: t,
            },
          },
        });
        if (!teamExists) {
          await this.prisma.team.create({
            data: {
              gnId: gn.id,
              teamNo: t,
              maxMembers: isNaN(maxMembers) || maxMembers < 1 ? 10 : maxMembers,
            },
          });
          importedTeams++;
        }
      }
    }

    return {
      rowCount,
      importedDistricts,
      importedDs,
      importedGn,
      importedTeams,
    };
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let insideQuotes = false;
    let current = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
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
