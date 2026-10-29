import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Device ID to terminate session for' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
