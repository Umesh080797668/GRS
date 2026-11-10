import { IsUUID, IsOptional, IsString } from 'class-validator';

export class ListAssignmentsDto {
  @IsUUID()
  @IsOptional()
  profileId?: string;

  @IsUUID()
  @IsOptional()
  gnId?: string;

  @IsUUID()
  @IsOptional()
  dsId?: string;

  @IsUUID()
  @IsOptional()
  districtId?: string;

  /** If 'active', only returns assignments where valid_to IS NULL */
  @IsString()
  @IsOptional()
  status?: 'active' | 'all';
}
