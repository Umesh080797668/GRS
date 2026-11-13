import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code: string;

  @IsOptional()
  @IsString()
  email?: string;
}
