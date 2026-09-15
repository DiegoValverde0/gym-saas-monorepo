import { IsEmail, IsString, IsOptional, IsUUID, MinLength } from 'class-validator';

export class CreateEmpleadoDto {
  @IsString()
  @MinLength(2)
  nombreCompleto: string;

  @IsEmail()
  correo: string;

  @IsString()
  @MinLength(8)
  contrasena: string;

  @IsString()
  @IsOptional()
  telefono?: string;

  @IsUUID()
  rolId: string;

  @IsUUID()
  @IsOptional()
  sucursalId?: string;
}
