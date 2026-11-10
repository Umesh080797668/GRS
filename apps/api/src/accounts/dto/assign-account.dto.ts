import {
  IsUUID,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * Body for POST /v1/accounts/:id/assign
 * Exactly one territory field must be supplied; enforced in AssignmentService.
 */
export class AssignAccountDto {
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
