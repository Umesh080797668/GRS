import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ScopeModule } from './common/scope/scope.module';
import { AuthModule } from './auth/auth.module';
import { AccountModule } from './accounts/account.module';
import { LookupModule } from './lookups/lookup.module';
import { AreaModule } from './areas/area.module';
import { AppConfigModule } from './config/app-config.module';
import { EmailModule } from './email/email.module';
import { APP_GUARD } from '@nestjs/core';
import { VersionGateGuard } from './config/version-gate.guard';
import { ReleasesModule } from './releases/releases.module';
import { JobsModule } from './jobs/jobs.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    ScopeModule,
    AuthModule,
    AccountModule,
    LookupModule,
    AreaModule,
    AppConfigModule,
    EmailModule,
    JobsModule,
    ReleasesModule,
    SyncModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: VersionGateGuard,
    },
  ],
})
export class AppModule {}
