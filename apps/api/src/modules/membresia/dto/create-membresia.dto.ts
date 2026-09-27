import { IsNotEmpty, IsOptional, IsUUID, IsDateString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMembresiaDto {
  @IsUUID()
  @IsNotEmpty()
  clienteId: string;

  @IsUUID()
  @IsNotEmpty()
  planId: string;

  @IsUUID()
  @IsOptional()
  promocionId?: string;

  @IsUUID()
  @IsOptional()
  sucursalId?: string;

  @IsDateString()
  @IsOptional()
  fechaInicio?: string;

  // Descuento manual en monto (venta del modo simple, plan 11.4): reemplaza a
  // las promociones cuando no hay campañas. No se combina con promocionId.
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  descuentoManual?: number;
}
