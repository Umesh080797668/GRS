import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LookupModule } from '../lookups/lookup.module';
import { ScopeModule } from '../common/scope/scope.module';

@Module({
  imports: [PrismaModule, LookupModule, ScopeModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
