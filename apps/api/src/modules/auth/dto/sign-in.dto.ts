import { IsEmail, IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class SignInDto {
  @IsEmail()
  correo: string;

  @IsString()
  @IsNotEmpty()
  contrasena: string;

  @IsString()
  @IsOptional()
  organizacionId?: string;
}
