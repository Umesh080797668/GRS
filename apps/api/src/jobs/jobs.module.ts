import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StatsRefreshService } from './stats-refresh.service';
import { ExportJobService } from './export-job.service';

@Module({
  imports: [PrismaModule],
  providers: [StatsRefreshService, ExportJobService],
  exports: [StatsRefreshService, ExportJobService],
})
export class JobsModule {}
