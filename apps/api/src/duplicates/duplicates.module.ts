import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ScopeModule } from '../common/scope/scope.module';
import { DuplicatesController } from './duplicates.controller';
import { DuplicatesService } from './duplicates.service';

@Module({
  imports: [PrismaModule, ScopeModule],
  controllers: [DuplicatesController],
  providers: [DuplicatesService],
  exports: [DuplicatesService],
})
export class DuplicatesModule { }
