import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateHouseholdDto {
  @IsUUID()
  @IsNotEmpty()
  districtId: string;

  @IsUUID()
  @IsNotEmpty()
  dsId: string;

  @IsUUID()
  @IsNotEmpty()
  gnId: string;

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
