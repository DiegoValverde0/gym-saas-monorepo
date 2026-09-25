import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// Rango de fechas locales ("YYYY-MM-DD", ambas incluidas) y sucursal
// opcional. Sin fechas: este mes hasta hoy.
export class RangoReporteDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @IsUUID()
  sucursalId?: string;
}
