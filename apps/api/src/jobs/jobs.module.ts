import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { LookupModule } from '../lookups/lookup.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ExportJobService } from './export-job.service';
import { ExportStorageService } from './export-storage.service';
import { ExportController } from './export.controller';
import { StatsRefreshService } from './stats-refresh.service';

@Module({
  imports: [PrismaModule, ConfigModule, AuthModule, LookupModule],
  controllers: [ExportController],
  providers: [StatsRefreshService, ExportStorageService, ExportJobService],
  exports: [StatsRefreshService, ExportStorageService, ExportJobService],
})
export class JobsModule { }
