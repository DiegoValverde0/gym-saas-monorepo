import { OmitType } from '@nestjs/mapped-types';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { CreateClasePlantillaDto } from './create-clase-plantilla.dto';

// Una "clase recurrente" (ej. Spinning Mar/Jue 18:00) = una ClasePlantilla por
// día con los mismos datos. Estos DTOs manejan la serie completa de una vez,
// en vez de obligar a crear/editar/borrar cada día por separado.
export class SerieClaseDto extends OmitType(CreateClasePlantillaDto, ['diaSemana', 'horaInicio'] as const) {
  // 0 = domingo ... 6 = sábado (Date#getUTCDay()).
  @IsArray()
  @ArrayMinSize(1, { message: 'Selecciona al menos un día de la semana.' })
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  diasSemana: number[];

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'horaInicio debe tener formato HH:MM' })
  horaInicio: string;

  // Fase 6 (DB-1): planes que pueden reservar cuando acceso = PLANES.
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  planIds?: string[];
}

export class ActualizarSerieClaseDto extends SerieClaseDto {
  // Plantillas que forman hoy la serie (una por día).
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids: string[];
}

export class EliminarSerieClaseDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids: string[];
}
