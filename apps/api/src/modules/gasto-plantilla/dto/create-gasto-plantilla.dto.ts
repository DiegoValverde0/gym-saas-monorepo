import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum, IsNumber, Min, Max, IsDateString, IsBoolean, IsInt } from 'class-validator';
import { MetodoPago, TipoConceptoVenta } from '@prisma/client';

export class CreateGastoPlantillaDto {
  @IsUUID()
  sucursalId: string;

  @IsUUID()
  @IsOptional()
  proveedorId?: string;

  @IsString()
  @IsOptional()
  beneficiario?: string;

  // Validado en el servicio contra CONCEPTOS_EGRESO (no alcanza con
  // @IsEnum(TipoConceptoVenta): eso aceptaría también categorías de venta).
  @IsEnum(TipoConceptoVenta)
  tipoConcepto: TipoConceptoVenta;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsNumber()
  @Min(0.01)
  monto: number;

  @IsEnum(MetodoPago)
  metodoPago: MetodoPago;

  @IsUUID()
  cuentaBancariaId: string;

  @IsInt()
  @Min(1)
  @Max(31)
  diaDelMes: number;

  @IsDateString()
  @IsNotEmpty()
  vigenciaDesde: string;

  @IsDateString()
  @IsOptional()
  vigenciaHasta?: string;

  @IsBoolean()
  @IsOptional()
  activa?: boolean;
}
