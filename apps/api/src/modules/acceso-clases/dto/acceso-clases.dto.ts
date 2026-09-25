import { ArrayUnique, IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';
import { MODOS_ACCESO_CLASE, ModoAccesoClase } from '../../../common/utils/acceso-clases.util';

// Regla de una disciplina (paso 4 del asistente de clase).
export class ReglaDisciplinaDto {
  @IsIn(MODOS_ACCESO_CLASE)
  modo: ModoAccesoClase;

  // Solo para modo PLANES.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  planIds?: string[];
}

// "Este plan incluye: ☑ Spinning ☑ Yoga ☐ Pilates" (desde el plan).
export class DisciplinasDelPlanDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  disciplinaIds: string[];
}
