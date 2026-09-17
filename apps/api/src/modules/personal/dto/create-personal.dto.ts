import { IsUUID, IsOptional, IsEnum, IsNumber, IsArray, Min, Max } from 'class-validator';
import { TipoContratacionStaff, EstadoGeneral } from '@prisma/client';

export class CreatePersonalDto {
  @IsUUID()
  usuarioId: string;

  @IsEnum(TipoContratacionStaff)
  @IsOptional()
  tipoContratacion?: TipoContratacionStaff;

  @IsNumber()
  @Min(0)
  @IsOptional()
  costoPorHora?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  comisionPorcentaje?: number;

  @IsEnum(EstadoGeneral)
  @IsOptional()
  estado?: EstadoGeneral;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  disciplinaIds?: string[];
}
