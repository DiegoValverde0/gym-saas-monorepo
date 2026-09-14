import { IsEmail, IsString, MinLength } from 'class-validator';

export class CrearOrganizacionDto {
  @IsString()
  @MinLength(2)
  nombreOrg: string;

  @IsString()
  @MinLength(2)
  nombreAdmin: string;

  @IsEmail()
  correo: string;

  @IsString()
  @MinLength(8)
  contrasena: string;
}
