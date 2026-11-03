import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsBoolean,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListDsDto {
  @IsUUID()
  @IsOptional()
  districtId?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsUUID()
  @IsOptional()
  cursor?: string;
}

export class ListGnDto {
  @IsUUID()
  @IsOptional()
  dsId?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsUUID()
  @IsOptional()
  cursor?: string;
}

export class ListTeamsDto {
  @IsUUID()
  @IsOptional()
  gnId?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsUUID()
  @IsOptional()
  cursor?: string;
}

export class CreateDsDto {
  @IsUUID()
  @IsNotEmpty()
  districtId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameEn: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameSi: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameTa: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  sdoName?: string;
}

export class CreateGnDto {
  @IsUUID()
  @IsNotEmpty()
  dsId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  gnNumber: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  gnName: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  secretaryName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  secretaryContact?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  secretaryEmail?: string;
}

export class UpdateGnDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  secretaryName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  secretaryContact?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  secretaryEmail?: string;
}

export class CreateTeamDto {
  @IsUUID()
  @IsNotEmpty()
  gnId: string;

  @IsInt()
  @Min(1)
  teamNo: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  maxMembers?: number = 10;
}

export class UpdateTeamDto {
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  maxMembers?: number;

  @IsUUID()
  @IsOptional()
  leaderId?: string;
}

export class ImportPilotAreaCsvDto {
  @IsString()
  @IsNotEmpty()
  csvContent: string;

  @IsBoolean()
  @IsOptional()
  dryRun?: boolean;
}
