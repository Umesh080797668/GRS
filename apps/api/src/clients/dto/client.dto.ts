import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Gender, InfoProvidedBy } from '@prisma/client';

export class CreateClientDto {
  @IsUUID()
  @IsNotEmpty()
  householdId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsInt()
  @Min(1)
  @Max(120)
  age: number;

  @IsEnum(Gender)
  gender: Gender;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phoneRaw?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phoneE164?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  whatsappRaw?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  whatsappE164?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  highestEducation?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  highestVocational?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  interestedVocationalStream?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  interestedJob?: string;

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
  hasSpecialNeeds: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  futureHopes?: string[] = [];

  @IsEnum(InfoProvidedBy)
  infoProvidedBy: InfoProvidedBy;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  infoProvidedByOther?: string;

  @IsBoolean()
  consentGiven: boolean;

  @IsDateString()
  @IsOptional()
  consentAt?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  consentVersion?: string;
}

export class UpdateClientDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsInt()
  @Min(1)
  @Max(120)
  @IsOptional()
  age?: number;

  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phoneRaw?: string;

  @IsString()
  @IsOptional()
  phoneE164?: string;

  @IsString()
  @IsOptional()
  whatsappRaw?: string;

  @IsString()
  @IsOptional()
  whatsappE164?: string;

  @IsString()
  @IsOptional()
  highestEducation?: string;

  @IsString()
  @IsOptional()
  highestVocational?: string;

  @IsString()
  @IsOptional()
  interestedVocationalStream?: string;

  @IsString()
  @IsOptional()
  interestedJob?: string;

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

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  futureHopes?: string[];

  @IsEnum(InfoProvidedBy)
  @IsOptional()
  infoProvidedBy?: InfoProvidedBy;

  @IsString()
  @IsOptional()
  infoProvidedByOther?: string;

  @IsString()
  @IsOptional()
  correctionReason?: string;
}
