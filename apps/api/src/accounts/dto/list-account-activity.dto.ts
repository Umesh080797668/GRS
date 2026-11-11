import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { UserRole } from '../../common/scope/scope.types';

/**
 * Query parameters for Super Admin user activity monitoring.
 */
export class ListAccountActivityDto {
  @IsIn(['all', 'online', 'offline', 'never'])
  @IsOptional()
  status?: 'all' | 'online' | 'offline' | 'never' = 'all';

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsIn(['all', 'web', 'mobile'])
  @IsOptional()
  clientType?: 'all' | 'web' | 'mobile' = 'all';

  @IsString()
  @IsOptional()
  @MaxLength(100)
  search?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 50;
}
