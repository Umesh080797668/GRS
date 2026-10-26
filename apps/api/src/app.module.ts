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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}


