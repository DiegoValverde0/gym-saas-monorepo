import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, Max, Min } from 'class-validator';

// La definición se valida a fondo contra el catálogo en validarDefinicion()
// (motor/definicion.ts): aquí solo se exige que sea un objeto.
export class EjecutarReporteDto {
  @IsObject()
  definicion: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  porPagina?: number;
}
