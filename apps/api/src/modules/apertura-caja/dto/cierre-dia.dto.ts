import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ResumenDiaQueryDto {
  @IsOptional()
  @IsUUID()
  sucursalId?: string;
}

// "Cerrar el día" del modo simple (plan 11.6): se cuenta el efectivo y se
// compara con lo esperado. No hace falta abrir la caja por la mañana.
export class CerrarDiaDto {
  @IsUUID()
  sucursalId: string;

  // Efectivo que había en la caja al empezar el día.
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  efectivoInicial: number;

  // Efectivo contado al cerrar.
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  efectivoContado: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
