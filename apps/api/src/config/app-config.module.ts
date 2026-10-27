import { Module, Global, forwardRef } from '@nestjs/common';
import { AppConfigService } from './app-config.service';
import { AppConfigController } from './app-config.controller';
import { VersionGateGuard } from './version-gate.guard';
import { RateLimitService } from './rate-limit.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ScopeModule } from '../common/scope/scope.module';

@Global()
@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule), ScopeModule],
  controllers: [AppConfigController],
  providers: [AppConfigService, VersionGateGuard, RateLimitService],
  exports: [AppConfigService, VersionGateGuard, RateLimitService],
})
export class AppConfigModule { }
