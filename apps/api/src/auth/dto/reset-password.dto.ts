import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Verified email address associated with the account',
    example: 'user@grs.gov.lk',
  })
  @IsEmail({}, { message: 'Must be a valid email address' })
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    description: '6-digit verification code sent to the email',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({
    description: 'New password chosen by user (minimum 8 characters)',
    example: 'NewSecure#Pass2026',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  newPassword!: string;
}
