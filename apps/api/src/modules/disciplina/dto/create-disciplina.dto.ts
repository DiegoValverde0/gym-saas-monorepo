import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { EstadoGeneral } from '@prisma/client';

export class CreateDisciplinaDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsEnum(EstadoGeneral)
  @IsOptional()
  estado?: EstadoGeneral;
}
