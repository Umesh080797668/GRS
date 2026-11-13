import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export const EXPORT_KINDS = [
  'progress',
  'clients',
  'beneficiaries',
  'interests',
  'duplicates',
] as const;

export const EXPORT_FORMATS = ['xlsx', 'csv'] as const;
export const EXPORT_LANGUAGES = ['en', 'si', 'ta'] as const;

export class ExportFiltersDto {
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
  @IsIn(['M', 'F'])
  gender?: 'M' | 'F';

  @IsOptional()
  @IsIn(['open', 'confirmed', 'dismissed'])
  status?: 'open' | 'confirmed' | 'dismissed';

  @IsOptional()
  @IsIn(['probable', 'possible'])
  classification?: 'probable' | 'possible';

  @IsOptional()
  @IsBoolean()
  includeDuplicates?: boolean;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}

export class CreateExportBodyDto {
  @IsIn(EXPORT_KINDS)
  kind!: (typeof EXPORT_KINDS)[number];

  @IsOptional()
  @IsIn(EXPORT_FORMATS)
  format?: (typeof EXPORT_FORMATS)[number];

  @IsOptional()
  @IsIn(EXPORT_LANGUAGES)
  lang?: (typeof EXPORT_LANGUAGES)[number];

  @IsOptional()
  @ValidateNested()
  @Type(() => ExportFiltersDto)
  filters?: ExportFiltersDto;

  @IsOptional()
  @IsBoolean()
  async?: boolean;
}

export class ListExportsQueryDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class ReportPreviewQueryDto {
  @IsIn(['progress', 'beneficiaries', 'interests', 'duplicates'])
  kind!: 'progress' | 'beneficiaries' | 'interests' | 'duplicates';

  @IsOptional()
  @IsIn(EXPORT_LANGUAGES)
  lang?: (typeof EXPORT_LANGUAGES)[number];

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
}
