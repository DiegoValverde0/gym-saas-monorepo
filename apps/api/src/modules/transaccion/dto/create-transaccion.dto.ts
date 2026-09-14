import { IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsEnum, ValidateNested, ArrayMinSize, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TipoTransaccion, MetodoPago, TipoConceptoVenta } from '@prisma/client';

export class DetalleTransaccionDto {
  @IsEnum(TipoConceptoVenta)
  @IsNotEmpty()
  tipoConcepto: TipoConceptoVenta;

  @IsUUID()
  @IsOptional()
  membresiaId?: string;

  @IsUUID()
  @IsOptional()
  productoId?: string;

  @IsUUID()
  @IsOptional()
  servicioId?: string;

  @IsString()
  @IsOptional()
  descripcionLibre?: string;

  @IsNumber()
  @Min(1)
  cantidad: number;

  @IsNumber()
  @Min(0)
  precioUnitario: number;

  @IsNumber()
  @Min(0)
  subtotal: number;
}

export class PagoDto {
  @IsEnum(MetodoPago)
  @IsNotEmpty()
  metodoPago: MetodoPago;

  @IsNumber()
  @Min(0)
  monto: number;

  @IsUUID()
  @IsOptional()
  cuentaBancariaId?: string;

  @IsString()
  @IsOptional()
  referencia?: string;
}

export class CreateTransaccionDto {
  @IsUUID()
  @IsNotEmpty()
  sucursalId: string;

  @IsUUID()
  @IsOptional()
  clienteId?: string;

  @IsEnum(TipoTransaccion)
  @IsNotEmpty()
  tipo: TipoTransaccion;

  @IsNumber()
  @Min(0)
  montoTotal: number;

  @ValidateNested({ each: true })
  @Type(() => DetalleTransaccionDto)
  @ArrayMinSize(1)
  detalles: DetalleTransaccionDto[];

  @ValidateNested({ each: true })
  @Type(() => PagoDto)
  @ArrayMinSize(1)
  pagos: PagoDto[];
}
