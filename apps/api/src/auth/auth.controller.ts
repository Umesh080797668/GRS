import {
  Controller,
  Post,
  Patch,
  Body,
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
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { ScopeContext } from '../common/scope/scope.types';

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

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
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
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
  ) {
    return this.authService.changePassword(user.userId, dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue new session pair' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out and revoke active refresh tokens' })
  async logout(@CurrentUser() user: ScopeContext) {
    return this.authService.logout(user.userId);
  }

  @Post('email/add')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add pending email and dispatch 6-digit OTP code' })
  async addEmail(
    @CurrentUser() user: ScopeContext,
    @Body() dto: { email: string },
  ) {
    return this.authService.addPendingEmail(user.userId, dto.email);
  }

  @Post('email/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify 6-digit OTP code and promote pending email' })
  async verifyEmail(
    @CurrentUser() user: ScopeContext,
    @Body() dto: { code: string },
  ) {
    return this.authService.verifyEmail(user.userId, dto.code);
  }

  @Post('forgot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset code via email (uniform 200)' })
  async forgotPassword(@Body() dto: { email: string }) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using verified 6-digit email code' })
  async resetPassword(
    @Body() dto: { email: string; code: string; newPassword: string },
  ) {
    return this.authService.resetPassword(dto.email, dto.code, dto.newPassword);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update user profile settings (preferredLanguage)' })
  async updateProfile(
    @CurrentUser() user: ScopeContext,
    @Body() dto: { preferredLanguage?: string },
  ) {
    return this.authService.updateProfile(user.userId, dto);
  }
}
