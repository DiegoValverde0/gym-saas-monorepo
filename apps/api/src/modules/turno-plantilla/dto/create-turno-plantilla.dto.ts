import { IsUUID, IsString, IsNotEmpty, IsOptional, IsInt, Min, Max, IsDateString, IsBoolean } from 'class-validator';

export class CreateTurnoPlantillaDto {
  @IsUUID()
  staffId: string;

  @IsUUID()
  sucursalId: string;

  // 0 = domingo ... 6 = sábado (Date#getUTCDay()).
  @IsInt()
  @Min(0)
  @Max(6)
  diaSemana: number;

  @IsString()
  @IsNotEmpty()
  horaEntrada: string; // "HH:MM"

  @IsString()
  @IsNotEmpty()
  horaSalida: string; // "HH:MM"

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
