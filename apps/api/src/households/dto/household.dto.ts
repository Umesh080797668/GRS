import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateHouseholdDto {
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

  @IsInt()
  @Min(1)
  @IsOptional()
  serialNo?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  houseNo: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  houseLeaderName: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  villageName?: string;

  @IsBoolean()
  @IsOptional()
  isEpf?: boolean = false;

  @IsBoolean()
  @IsOptional()
  isEtf?: boolean = false;

  @IsBoolean()
  @IsOptional()
  isAswesuma?: boolean = false;

  @IsBoolean()
  @IsOptional()
  isSamurdhi?: boolean = false;

  @IsBoolean()
  @IsOptional()
  hasSpecialNeeds?: boolean = false;

  @IsInt()
  @Min(0)
  @Max(99)
  @IsOptional()
  targetFemale?: number = 0;

  @IsInt()
  @Min(0)
  @Max(99)
  @IsOptional()
  targetMale?: number = 0;

  @IsInt()
  @Min(1)
  @Max(120)
  @IsOptional()
  ageGroupMin?: number;

  @IsInt()
  @Min(1)
  @Max(120)
  @IsOptional()
  ageGroupMax?: number;

  @IsBoolean()
  @IsOptional()
  langSinhala?: boolean = false;

  @IsBoolean()
  @IsOptional()
  langTamil?: boolean = false;

  @IsBoolean()
  @IsOptional()
  langEnglish?: boolean = false;
}

export class UpdateHouseholdDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  houseNo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  houseLeaderName?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  villageName?: string;

  @IsBoolean()
  @IsOptional()
  isEpf?: boolean;

  @IsBoolean()
  @IsOptional()
  isEtf?: boolean;

  @IsBoolean()
  @IsOptional()
  isAswesuma?: boolean;

  @IsBoolean()
  @IsOptional()
  isSamurdhi?: boolean;

  @IsBoolean()
  @IsOptional()
  hasSpecialNeeds?: boolean;

  @IsInt()
  @Min(0)
  @Max(99)
  @IsOptional()
  targetFemale?: number;

  @IsInt()
  @Min(0)
  @Max(99)
  @IsOptional()
  targetMale?: number;

  @IsInt()
  @IsOptional()
  ageGroupMin?: number;

  @IsInt()
  @IsOptional()
  ageGroupMax?: number;

  @IsBoolean()
  @IsOptional()
  langSinhala?: boolean;

  @IsBoolean()
  @IsOptional()
  langTamil?: boolean;

  @IsBoolean()
  @IsOptional()
  langEnglish?: boolean;

  @IsUUID()
  @IsOptional()
  teamId?: string;
}

export class AssignHousesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  houseIds: string[];
}

export class DeleteHouseholdDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  reason?: string;
}

export class ListHouseholdsDto {
  @IsUUID()
  @IsOptional()
  gnId?: string;

  @IsUUID()
  @IsOptional()
  teamId?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  cursor?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 50;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  unassignedOnly?: boolean;
}
