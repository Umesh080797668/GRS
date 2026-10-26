import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';

export interface CreateExportDto {
  requestedBy: string;
  kind: string; // 'progress' | 'clients' | 'households' | 'duplicates'
  filters?: Record<string, any>;
}

@Injectable()
export class ExportJobService {
  private readonly logger = new Logger(ExportJobService.name);

  constructor(private readonly prisma: PrismaService) { }

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
  async processExport(jobId: string): Promise<{ jobId: string; rowCount: number; status: JobStatus }> {
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
        { header: 'Full Name', key: 'name', width: 25 },
        { header: 'Age', key: 'age', width: 10 },
        { header: 'Gender', key: 'gender', width: 10 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'WhatsApp', key: 'whatsapp', width: 15 },
        { header: 'Education', key: 'education', width: 20 },
        { header: 'Vocational Qualification', key: 'vocational', width: 25 },
        { header: 'Stream', key: 'stream', width: 25 },
        { header: 'Job Interest', key: 'job', width: 25 },
      ];
    } else {
      sheet.columns = [
        { header: 'Household ID', key: 'id', width: 36 },
        { header: 'House Number', key: 'houseNo', width: 15 },
        { header: 'House Leader', key: 'houseLeaderName', width: 25 },
        { header: 'Village', key: 'villageName', width: 20 },
        { header: 'EPF', key: 'isEpf', width: 10 },
        { header: 'Aswesuma', key: 'isAswesuma', width: 12 },
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

    this.logger.log(`Export job ${jobId} completed (${rowCount} rows, ${buffer.byteLength} bytes)`);

    return {
      jobId: job.id,
      rowCount,
      status: JobStatus.done,
    };
  }

  /**
   * Refreshes dirty stats summary tables, simulating the pg_cron scheduled runner (Spike S7 / M1.14).
   */
  async refreshDirtySummaries(): Promise<{ refreshedAt: Date; teamsCount: number }> {
    const now = new Date();
    // Simulate updating area and team statistics
    return {
      refreshedAt: now,
      teamsCount: 1,
    };
  }
}
