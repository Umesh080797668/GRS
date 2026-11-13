import { IsUUID, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SwitchAreaDto {
  @ApiProperty({ description: 'GN Division UUID to switch active session to' })
  @IsUUID()
  @IsNotEmpty()
  gnId: string;

  @ApiPropertyOptional({ description: 'Device ID if called from mobile app' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
