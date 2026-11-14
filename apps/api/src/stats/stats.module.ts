import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ScopeModule } from '../common/scope/scope.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [PrismaModule, ScopeModule, JobsModule],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule { }
