import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'User ID (e.g. GRS1234567890) or verified email address',
    example: 'GRS1234567890',
  })
  @IsNotEmpty()
  @IsString()
  identifier!: string;

  @ApiProperty({
    description: 'User password (grouped XXXX-XXXX-XXXX or plain)',
    example: 'ABCD-EFGH-JKLM',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({
    description: 'Device identifier for session tracking and pacing',
    example: 'device-uuid-1234',
    required: false,
  })
  @IsString()
  deviceId?: string;
}
