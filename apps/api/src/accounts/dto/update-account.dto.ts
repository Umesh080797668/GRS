import { IsOptional, IsString, IsUUID, IsBoolean } from 'class-validator';

export class UpdateAccountDto {
  @IsString()
  @IsOptional()
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
}
