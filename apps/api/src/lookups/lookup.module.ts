import { Module } from '@nestjs/common';
import { LookupService } from './lookup.service';
import { LookupController } from './lookup.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ScopeModule } from '../common/scope/scope.module';

@Module({
  imports: [PrismaModule, AuthModule, ScopeModule],
  controllers: [LookupController],
  providers: [LookupService],
  exports: [LookupService],
})
export class LookupModule { }
