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
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { VersionGateGuard } from './config/version-gate.guard';
import { ActivityInterceptor } from './auth/activity.interceptor';
import { ReleasesModule } from './releases/releases.module';
import { JobsModule } from './jobs/jobs.module';
import { SyncModule } from './sync/sync.module';
import { HouseholdModule } from './households/household.module';
import { ClientModule } from './clients/client.module';
import { StatsModule } from './stats/stats.module';
import { ImportModule } from './imports/import.module';

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
    HouseholdModule,
    ClientModule,
    StatsModule,
    ImportModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: VersionGateGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ActivityInterceptor,
    },
  ],
})
export class AppModule { }
