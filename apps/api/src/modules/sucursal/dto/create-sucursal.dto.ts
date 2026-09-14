import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { EstadoGeneral } from '@prisma/client';

export class CreateSucursalDto {
  @IsString()
  nombre: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsBoolean()
  esPrincipal?: boolean;

  @IsOptional()
  @IsEnum(EstadoGeneral)
  estado?: EstadoGeneral;
}
