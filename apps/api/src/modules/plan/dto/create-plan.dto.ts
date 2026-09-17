import { IsString, IsNotEmpty, IsOptional, IsInt, IsArray, IsBoolean, IsEnum, IsNumber, Min } from 'class-validator';
import { TipoPlan, EstadoGeneral } from '@prisma/client';

export class CreatePlanDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsEnum(TipoPlan)
  @IsNotEmpty()
  tipoPlan: TipoPlan;

  @IsInt()
  @Min(1)
  @IsOptional()
  duracionDias?: number;

  @IsInt()
  @IsOptional()
  limiteDiasSemana?: number;

  @IsArray()
  @IsOptional()
  diasPermitidos?: number[];

  @IsInt()
  @IsOptional()
  cantidadSesiones?: number;

  @IsString()
  @IsOptional()
  horaInicioAcceso?: string; // Prisma accepts ISO strings for Time (or DateTime)

  @IsString()
  @IsOptional()
  horaFinAcceso?: string;

  @IsBoolean()
  @IsOptional()
  esRenovableAutomaticamente?: boolean;

  @IsNumber()
  @IsNotEmpty()
  precio: number; // We can use number in DTO and it will be converted to Decimal in Prisma

  @IsEnum(EstadoGeneral)
  @IsOptional()
  estado?: EstadoGeneral;
}
