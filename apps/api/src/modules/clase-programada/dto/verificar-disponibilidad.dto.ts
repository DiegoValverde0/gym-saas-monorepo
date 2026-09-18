import { IsUUID, IsDateString, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class VerificarDisponibilidadDto {
  @IsUUID()
  entrenadorId: string;

  @IsUUID()
  sucursalId: string;

  @IsDateString()
  fechaHora: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duracionMinutos?: number;
}
