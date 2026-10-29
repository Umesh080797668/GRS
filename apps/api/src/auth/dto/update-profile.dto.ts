import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'Preferred interface language (en, si, ta)',
    example: 'si',
    enum: ['en', 'si', 'ta'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['en', 'si', 'ta'], {
    message: 'Preferred language must be one of: en, si, ta',
  })
  preferredLanguage?: string;
}
