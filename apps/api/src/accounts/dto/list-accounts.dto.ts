import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../../common/scope/scope.types';

export class ListAccountsDto {
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsUUID()
  @IsOptional()
  teamId?: string;

  @IsUUID()
  @IsOptional()
  gnId?: string;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;

  @IsString()
  @IsOptional()
  search?: string;

  @IsUUID()
  @IsOptional()
  cursor?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  take?: number = 50;
}
