import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current or temporary password' })
  @IsNotEmpty()
  @IsString()
  currentPassword!: string;

  @ApiProperty({
    description: 'New password chosen by user (minimum 8 characters)',
    example: 'Secure#2026Password!',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
