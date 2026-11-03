import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class PreviewImportDto {
  @IsUUID()
  @IsNotEmpty()
  gnId: string;
}

export class ImportTemplateQueryDto {
  @IsString()
  @IsOptional()
  lang?: string = 'en';
}

