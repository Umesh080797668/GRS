import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../../common/scope/scope.types';

export class MemberItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phoneE164?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5)
  preferredLanguage?: string = 'si';
}

export class CreateBulkAccountsDto {
  @IsEnum(UserRole)
  role: UserRole;

  @IsInt()
  @Min(1)
  @Max(100)
  count: number;

  @IsUUID()
  @IsOptional()
  districtId?: string;

  @IsUUID()
  @IsOptional()
  dsId?: string;

  @IsUUID()
  @IsOptional()
  gnId?: string;

  @IsUUID()
  @IsOptional()
  teamId?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => MemberItemDto)
  members?: MemberItemDto[];
}
