import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum StatAreaType {
  national = 'national',
  district = 'district',
  ds = 'ds',
  gn = 'gn',
  team = 'team',
}

export class GetProgressDto {
  @IsOptional()
  @IsEnum(StatAreaType, {
    message: 'areaType must be one of: national, district, ds, gn, team',
  })
  areaType?: StatAreaType;

  @IsOptional()
  @IsString()
  areaId?: string;
}

