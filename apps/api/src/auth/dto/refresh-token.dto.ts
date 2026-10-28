import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Valid refresh token string' })
  @IsNotEmpty()
  @IsString()
  refreshToken!: string;

  @ApiProperty({ description: 'Device ID', required: false })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
