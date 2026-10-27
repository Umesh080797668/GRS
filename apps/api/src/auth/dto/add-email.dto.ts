import { IsEmail, IsNotEmpty } from 'class-validator';

export class AddEmailDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
