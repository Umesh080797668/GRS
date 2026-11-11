import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Request payload for client activity heartbeat pings.
 */
export class HeartbeatDto {
  @ApiPropertyOptional({
    description: 'Device identifier for attribution across platforms',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceId?: string;
}
