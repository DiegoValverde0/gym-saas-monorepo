import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsUUID, Matches, Max, Min, ValidateNested } from 'class-validator';

const HORA_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

class DiaHorarioDto {
  // 0 = domingo ... 6 = sábado (Date#getUTCDay()).
  @IsInt()
  @Min(0)
  @Max(6)
  diaSemana: number;

  @Matches(HORA_HHMM, { message: 'horaEntrada debe tener formato HH:MM' })
  horaEntrada: string;

  @Matches(HORA_HHMM, { message: 'horaSalida debe tener formato HH:MM' })
  horaSalida: string;
}

// Horario semanal completo de una persona del equipo, en una sola sucursal.
// Un día puede tener varios bloques no solapados (turno partido, 6–10 y
// 16–20). Guardarlo REEMPLAZA el horario anterior (ver
// TurnoPlantillaService.reemplazarHorarioStaff). `dias: []` deja a la persona
// sin horario fijo.
export class HorarioSemanalDto {
  @IsUUID()
  sucursalId: string;

  @IsArray()
  @ArrayMaxSize(21)
  @ValidateNested({ each: true })
  @Type(() => DiaHorarioDto)
  dias: DiaHorarioDto[];
}
