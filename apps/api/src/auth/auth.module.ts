import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EmailModule } from '../email/email.module';
import { AuthService } from './auth.service';
import { CredentialService } from './credential.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    EmailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_ACCESS_SECRET');
        if (!secret || secret.trim().length === 0) {
          throw new Error(
            'CRITICAL SECURITY ERROR: JWT_ACCESS_SECRET is not configured in environment variables. Application will not start without a secure JWT secret.',
          );
        }
        return {
          secret,
          signOptions: { expiresIn: '15m' },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, CredentialService, JwtStrategy, RolesGuard],
  exports: [
    AuthService,
    CredentialService,
    JwtStrategy,
    RolesGuard,
    PassportModule,
    JwtModule,
  ],
})
export class AuthModule {}
