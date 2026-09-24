import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Matches, Min } from 'class-validator';

// Selector de entrenador del formulario de clase. Dos modos:
//  - Clase puntual: `fechaHora` -> disponibilidad según los turnos de ese día.
//  - Clase recurrente: `diasSemana` + `horaInicio` -> disponibilidad según el
//    horario semanal de cada persona (sus TurnoPlantilla).
export class EntrenadoresClaseDto {
  @IsUUID()
  sucursalId: string;

  @IsOptional()
  @IsUUID()
  disciplinaId?: string;

  @IsOptional()
  @IsDateString()
  fechaHora?: string;

  // "1,3,5" (0 = domingo ... 6 = sábado)
  @IsOptional()
  @Matches(/^[0-6](,[0-6])*$/)
  diasSemana?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  horaInicio?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duracionMinutos?: number;
}
