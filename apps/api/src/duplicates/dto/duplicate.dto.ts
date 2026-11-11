import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum DuplicateFilterStatus {
  open = 'open',
  confirmed = 'confirmed',
  dismissed = 'dismissed',
  all = 'all',
}

export enum DuplicateClassificationFilter {
  probable = 'probable',
  possible = 'possible',
  all = 'all',
}

export class ListDuplicatesDto {
  @IsOptional()
  @IsEnum(DuplicateFilterStatus)
  status?: DuplicateFilterStatus = DuplicateFilterStatus.open;

  @IsOptional()
  @IsEnum(DuplicateClassificationFilter)
  classification?: DuplicateClassificationFilter =
    DuplicateClassificationFilter.all;

  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(0)
  @Max(100)
  minScore?: number;

  @IsOptional()
  @IsUUID()
  districtId?: string;

  @IsOptional()
  @IsUUID()
  dsId?: string;

  @IsOptional()
  @IsUUID()
  gnId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => (value !== undefined ? Number(value) : 50))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class ConfirmDuplicateDto {
  @IsOptional()
  @IsUUID()
  canonicalClientId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class DismissDuplicateDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

