import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, IsDateString } from 'class-validator';
import { EstadoGeneral } from '@prisma/client';

export class CreatePromocionDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsNumber()
  @IsOptional()
  porcentajeDescuento?: number;

  @IsNumber()
  @IsOptional()
  montoDescuentoFijo?: number;

  @IsDateString()
  @IsNotEmpty()
  fechaInicio: string;

  @IsDateString()
  @IsNotEmpty()
  fechaFin: string;

  @IsEnum(EstadoGeneral)
  @IsOptional()
  estado?: EstadoGeneral;
}
