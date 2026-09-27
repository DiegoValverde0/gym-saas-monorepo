import { IsOptional, IsUUID, Matches } from 'class-validator';

// Grilla del asistente "Nueva clase" (plan de simplificación, 8.2, paso 3).
export class HorariosDisponiblesDto {
  @IsUUID()
  sucursalId: string;

  // Sin instructor: la grilla solo muestra las otras clases de la sucursal.
  @IsOptional()
  @IsUUID()
  entrenadorId?: string;

  // Con sala: las clases que ya la usan se marcan como ocupadas (fase 6, DB-2).
  @IsOptional()
  @IsUUID()
  salaId?: string;

  // Series que se están editando: sus propios horarios no cuentan como ocupados.
  // "id1,id2"
  @IsOptional()
  @Matches(/^[0-9a-f-]{36}(,[0-9a-f-]{36})*$/i)
  excluirIds?: string;
}
