import { Module } from '@nestjs/common';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';
import { AssignmentService } from './assignment.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ScopeModule } from '../common/scope/scope.module';

@Module({
  imports: [PrismaModule, AuthModule, ScopeModule],
  controllers: [AccountController],
  providers: [AccountService, AssignmentService],
  exports: [AccountService, AssignmentService],
})
export class AccountModule { }
