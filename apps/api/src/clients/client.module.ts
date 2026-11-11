import { Module } from '@nestjs/common';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ScopeModule } from '../common/scope/scope.module';
import { LookupModule } from '../lookups/lookup.module';
import { DuplicatesModule } from '../duplicates/duplicates.module';

@Module({
  imports: [PrismaModule, ScopeModule, LookupModule, DuplicatesModule],
  controllers: [ClientController],
  providers: [ClientService],
  exports: [ClientService],
})
export class ClientModule {}
