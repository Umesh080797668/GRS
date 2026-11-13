import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AddEmailDto } from './dto/add-email.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { LogoutDto } from './dto/logout.dto';
import { SwitchAreaDto } from './dto/switch-area.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { normalizeClientType } from './session-activity.service';
import type { ScopeContext } from '../common/scope/scope.types';

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  private extractClientMeta(req?: any, explicitDeviceId?: string) {
    const headers = req?.headers ?? {};
    const headerDeviceId =
      typeof headers['x-device-id'] === 'string'
        ? headers['x-device-id']
        : undefined;
    const deviceId = explicitDeviceId || headerDeviceId;
    const clientType = normalizeClientType({
      clientType:
        typeof headers['x-client-type'] === 'string'
          ? headers['x-client-type']
          : undefined,
      deviceId,
      hasAppVersionHeader: Boolean(headers['x-app-version']),
      userAgent:
        typeof headers['user-agent'] === 'string'
          ? headers['user-agent']
          : undefined,
    });
    return { clientType, deviceId };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in with generated GRS ID or verified email and password',
  })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful or password change required',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or account locked',
  })
  async login(@Body() dto: LoginDto, @Req() req?: any) {
    const clientIp = req?.ip || req?.socket?.remoteAddress || '127.0.0.1';
    const { clientType, deviceId } = this.extractClientMeta(req, dto.deviceId);
    if (!dto.deviceId && deviceId) {
      dto.deviceId = deviceId;
    }
    return this.authService.login(dto, clientIp, clientType);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change password on first sign-in or user profile update',
  })
  async changePassword(
    @CurrentUser() user: ScopeContext,
    @Body() dto: ChangePasswordDto,
    @Req() req?: any,
  ) {
    const { clientType, deviceId } = this.extractClientMeta(req);
    return this.authService.changePassword(
      user.userId,
      dto,
      clientType,
      deviceId,
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue new session pair' })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req?: any) {
    const { clientType } = this.extractClientMeta(req);
    return this.authService.refreshTokens(dto, clientType);
  }

  @Post('switch-area')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Switch active GN area session for multi-GN CDC secretary (Decision C20)',
  })
  async switchArea(
    @CurrentUser() user: ScopeContext,
    @Body() dto: SwitchAreaDto,
    @Req() req?: any,
  ) {
    const { clientType, deviceId } = this.extractClientMeta(req, dto.deviceId);
    if (!dto.deviceId && deviceId) {
      dto.deviceId = deviceId;
    }
    return this.authService.switchArea(user.userId, dto, clientType);
  }

  @Get('assignments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List assigned GN divisions for current user' })
  async getAssignments(@CurrentUser() user: ScopeContext) {
    return this.authService.getAssignments(user.userId);
  }

  @Post('heartbeat')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Keep active user session alive and update lastActiveAt',
  })
  async heartbeat(
    @CurrentUser() user: ScopeContext,
    @Body() dto?: HeartbeatDto,
    @Req() req?: any,
  ) {
    const { clientType, deviceId } = this.extractClientMeta(req, dto?.deviceId);
    return this.authService.recordHeartbeat(user.userId, clientType, deviceId);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out and revoke active refresh tokens' })
  async logout(
    @CurrentUser() user: ScopeContext,
    @Body() dto?: LogoutDto,
    @Req() req?: any,
  ) {
    const { clientType, deviceId } = this.extractClientMeta(req, dto?.deviceId);
    return this.authService.logout(user.userId, deviceId, clientType);
  }

  @Post('email/add')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add pending email and dispatch 6-digit OTP code' })
  async addEmail(@CurrentUser() user: ScopeContext, @Body() dto: AddEmailDto) {
    return this.authService.addPendingEmail(user.userId, dto.email);
  }

  @Post('email/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify 6-digit OTP code and promote pending email',
  })
  async verifyEmail(
    @CurrentUser() user: ScopeContext,
    @Body() dto: VerifyEmailDto,
  ) {
    return this.authService.verifyEmail(user.userId, dto.code);
  }

  @Post('forgot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset code via email (uniform 200)',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req?: any) {
    const clientIp = req?.ip || req?.socket?.remoteAddress || '127.0.0.1';
    return this.authService.forgotPassword(dto.email, clientIp);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using verified 6-digit email code' })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req?: any) {
    const clientIp = req?.ip || req?.socket?.remoteAddress || '127.0.0.1';
    return this.authService.resetPassword(dto.email, dto.code, dto.newPassword, clientIp);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update user profile settings (preferredLanguage)' })
  async updateProfile(
    @CurrentUser() user: ScopeContext,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.userId, dto);
  }
}
