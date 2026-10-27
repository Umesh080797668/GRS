import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';

export const EXPORT_COLUMNS_REGISTRY: Record<
  string,
  { header: string; key: string; width: number }
> = {
  // Household / Area pre-visit export columns
  district_name: { header: 'District', key: 'district_name', width: 20 },
  ds_name: { header: 'Divisional Secretariat', key: 'ds_name', width: 25 },
  sdo_name: { header: 'SDO Officer Name', key: 'sdo_name', width: 25 },
  gn_number: { header: 'GN Division Number', key: 'gn_number', width: 15 },
  gn_name: { header: 'GN Division Name', key: 'gn_name', width: 25 },
  secretary_name: {
    header: 'CDC Secretary Name',
    key: 'secretary_name',
    width: 25,
  },
  secretary_contact: {
    header: 'CDC Secretary Contact',
    key: 'secretary_contact',
    width: 20,
  },
  secretary_email: {
    header: 'CDC Secretary Email',
    key: 'secretary_email',
    width: 25,
  },
  serial_no: { header: 'Serial Number', key: 'serial_no', width: 15 },
  house_no: { header: 'House Number', key: 'house_no', width: 15 },
  house_leader_name: {
    header: 'House Leader Name',
    key: 'house_leader_name',
    width: 25,
  },
  address: { header: 'Address', key: 'address', width: 30 },
  village_name: { header: 'Village Name', key: 'village_name', width: 20 },
  is_epf: { header: 'EPF Beneficiary', key: 'is_epf', width: 15 },
  is_etf: { header: 'ETF Beneficiary', key: 'is_etf', width: 15 },
  is_aswesuma: {
    header: 'Aswesuma Beneficiary',
    key: 'is_aswesuma',
    width: 15,
  },
  is_samurdhi: {
    header: 'Samurdhi Beneficiary',
    key: 'is_samurdhi',
    width: 15,
  },
  has_special_needs: {
    header: 'Special Needs in Household',
    key: 'has_special_needs',
    width: 15,
  },
  target_female: {
    header: 'Target Female Count',
    key: 'target_female',
    width: 15,
  },
  target_male: { header: 'Target Male Count', key: 'target_male', width: 15 },
  age_group_min: { header: 'Age Group Min', key: 'age_group_min', width: 15 },
  age_group_max: { header: 'Age Group Max', key: 'age_group_max', width: 15 },
  lang_sinhala: { header: 'Language Sinhala', key: 'lang_sinhala', width: 15 },
  lang_tamil: { header: 'Language Tamil', key: 'lang_tamil', width: 15 },
  lang_english: { header: 'Language English', key: 'lang_english', width: 15 },
  team_no: { header: 'Assigned Team', key: 'team_no', width: 15 },

  // Client export columns
  client_name: { header: 'Client Name', key: 'client_name', width: 25 },
  client_age: { header: 'Client Age', key: 'client_age', width: 12 },
  client_gender: { header: 'Client Gender', key: 'client_gender', width: 12 },
  client_address: {
    header: 'Client Address',
    key: 'client_address',
    width: 30,
  },
  phone_raw: { header: 'Phone Raw', key: 'phone_raw', width: 18 },
  phone_e164: { header: 'Phone E164', key: 'phone_e164', width: 18 },
  whatsapp_raw: { header: 'WhatsApp Raw', key: 'whatsapp_raw', width: 18 },
  whatsapp_e164: { header: 'WhatsApp E164', key: 'whatsapp_e164', width: 18 },
  highest_education: {
    header: 'Highest Education',
    key: 'highest_education',
    width: 25,
  },
  highest_vocational: {
    header: 'Highest Vocational Qualification',
    key: 'highest_vocational',
    width: 25,
  },
  interested_vocational_stream: {
    header: 'Interested Vocational Stream',
    key: 'interested_vocational_stream',
    width: 25,
  },
  interested_job: {
    header: 'Interested Job',
    key: 'interested_job',
    width: 25,
  },
  client_is_epf: { header: 'Client EPF', key: 'client_is_epf', width: 15 },
  client_is_etf: { header: 'Client ETF', key: 'client_is_etf', width: 15 },
  client_is_aswesuma: {
    header: 'Client Aswesuma',
    key: 'client_is_aswesuma',
    width: 15,
  },
  client_is_samurdhi: {
    header: 'Client Samurdhi',
    key: 'client_is_samurdhi',
    width: 15,
  },
  client_has_special_needs: {
    header: 'Client Special Needs',
    key: 'client_has_special_needs',
    width: 15,
  },
  future_hopes: { header: 'Future Hopes', key: 'future_hopes', width: 30 },
  info_provided_by: {
    header: 'Information Provided By',
    key: 'info_provided_by',
    width: 20,
  },
  info_provided_by_other: {
    header: 'Information Provided By Other',
    key: 'info_provided_by_other',
    width: 25,
  },
  consent_given: { header: 'Consent Given', key: 'consent_given', width: 15 },
};

export interface CreateExportDto {
  requestedBy: string;
  kind: string; // 'progress' | 'clients' | 'households' | 'duplicates'
  filters?: Record<string, any>;
}

@Injectable()
export class ExportJobService {
  private readonly logger = new Logger(ExportJobService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Queues an asynchronous export job (Spike S7 / M0.9).
   */
  async queueExport(dto: CreateExportDto) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days retention

    const job = await this.prisma.exportJob.create({
      data: {
        requestedBy: dto.requestedBy,
        kind: dto.kind,
        filters: dto.filters || {},
        status: JobStatus.queued,
        expiresAt,
      },
    });

    return job;
  }

  /**
   * Processes a queued export job end-to-end, writing Excel workbook (Spike S7).
   */
  async processExport(
    jobId: string,
  ): Promise<{ jobId: string; rowCount: number; status: JobStatus }> {
    const job = await this.prisma.exportJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException({
        code: 'JOB_NOT_FOUND',
        message: 'Export job not found',
      });
    }

    // 1. Transition to running
    await this.prisma.exportJob.update({
      where: { id: jobId },
      data: { status: JobStatus.running },
    });

    // 2. Build Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GRS System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Export Data');

    // Define columns based on kind
    if (job.kind === 'clients') {
      sheet.columns = [
        { header: 'Client ID', key: 'id', width: 36 },
        EXPORT_COLUMNS_REGISTRY.client_name,
        EXPORT_COLUMNS_REGISTRY.client_age,
        EXPORT_COLUMNS_REGISTRY.client_gender,
        EXPORT_COLUMNS_REGISTRY.phone_e164,
        EXPORT_COLUMNS_REGISTRY.whatsapp_e164,
        EXPORT_COLUMNS_REGISTRY.highest_education,
        EXPORT_COLUMNS_REGISTRY.highest_vocational,
        EXPORT_COLUMNS_REGISTRY.interested_vocational_stream,
        EXPORT_COLUMNS_REGISTRY.interested_job,
      ];
    } else {
      sheet.columns = [
        { header: 'Household ID', key: 'id', width: 36 },
        EXPORT_COLUMNS_REGISTRY.house_no,
        EXPORT_COLUMNS_REGISTRY.house_leader_name,
        EXPORT_COLUMNS_REGISTRY.village_name,
        EXPORT_COLUMNS_REGISTRY.is_epf,
        EXPORT_COLUMNS_REGISTRY.is_aswesuma,
      ];
    }

    // Synthetic row generation for spike verification
    const rowCount = 50;
    for (let i = 1; i <= rowCount; i++) {
      if (job.kind === 'clients') {
        sheet.addRow({
          id: `client-uuid-${i}`,
          name: `Beneficiary ${i}`,
          age: 20 + (i % 30),
          gender: i % 2 === 0 ? 'female' : 'male',
          phone: `+9477${String(i).padStart(7, '0')}`,
          whatsapp: `+9477${String(i).padStart(7, '0')}`,
          education: 'EDU_AL_PASSED',
          vocational: 'VOC_NVQ_4',
          stream: 'STREAM_IT_COMPUTING',
          job: 'JOB_SOFTWARE_DEV',
        });
      } else {
        sheet.addRow({
          id: `house-uuid-${i}`,
          houseNo: `${i}/A`,
          houseLeaderName: `House Leader ${i}`,
          villageName: 'Sample Village',
          isEpf: i % 2 === 0,
          isAswesuma: i % 3 === 0,
        });
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filePath = `exports/${job.id}.${job.kind}.xlsx`;

    // 3. Mark completed
    await this.prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.done,
        filePath,
      },
    });

    this.logger.log(
      `Export job ${jobId} completed (${rowCount} rows, ${buffer.byteLength} bytes)`,
    );

    return {
      jobId: job.id,
      rowCount,
      status: JobStatus.done,
    };
  }

  /**
   * Refreshes dirty stats summary tables, simulating the pg_cron scheduled runner (Spike S7 / M1.14).
   */
  async refreshDirtySummaries(): Promise<{
    refreshedAt: Date;
    teamsCount: number;
  }> {
    const now = new Date();
    // Simulate updating area and team statistics
    return {
      refreshedAt: now,
      teamsCount: 1,
    };
  }
}
