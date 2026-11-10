import { IsUUID, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for POST /v1/accounts/:id/transfer
 * Moves the current open assignment from :id to toProfileId.
 * If territory fields are omitted, the existing assignment's territory is copied.
 */
export class TransferAccountDto {
  @IsUUID()
  toProfileId: string;

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

  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
