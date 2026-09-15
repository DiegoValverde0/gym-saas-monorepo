import { IsUUID, IsOptional, IsInt, IsString, Min } from 'class-validator';

export class CreateInventarioDto {
  @IsUUID()
  productoId: string;

  @IsUUID()
  sucursalId: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  cantidadActual?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  puntoReorden?: number;

  @IsString()
  @IsOptional()
  ubicacionBodega?: string;
}
