import {
  IsOptional,
  IsString,
  IsUUID,
  IsBoolean,
  IsNotEmpty,
  MaxLength,
  IsIn,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateAccountDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(255)
  fullName?: string;

  @IsString()
  @IsOptional()
  phoneE164?: string;

  @IsUUID()
  @IsOptional()
  teamId?: string | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsIn(['si', 'ta', 'en'])
  @IsOptional()
  preferredLanguage?: 'si' | 'ta' | 'en';
}
