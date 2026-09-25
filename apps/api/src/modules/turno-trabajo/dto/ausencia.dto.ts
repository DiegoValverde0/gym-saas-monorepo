import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const MOTIVOS_AUSENCIA = ['VACACIONES', 'ENFERMEDAD', 'PERMISO', 'OTRO'] as const;
export type MotivoAusencia = (typeof MOTIVOS_AUSENCIA)[number];

// Ausencia por rango (plan 7.2 c): marca como AUSENTE todas las jornadas de la
// persona entre `desde` y `hasta`, ambos incluidos ("YYYY-MM-DD", fecha local).
export class AusenciaDto {
  @IsUUID()
  staffId: string;

  @IsDateString()
  desde: string;

  @IsDateString()
  hasta: string;

  @IsIn(MOTIVOS_AUSENCIA)
  motivo: MotivoAusencia;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nota?: string;

  // Si se indica, las clases de la persona en esas fechas pasan a este
  // instructor (salvo las que le chocan con otra clase).
  @IsOptional()
  @IsUUID()
  reemplazoStaffId?: string;
}

// "Quitar ausencia": vuelve a PROGRAMADO las jornadas ausentes del rango.
export class QuitarAusenciaDto {
  @IsUUID()
  staffId: string;

  @IsDateString()
  desde: string;

  @IsDateString()
  hasta: string;
}

export class RangoAusenciasQueryDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}

export class JornadasHoyQueryDto {
  @IsOptional()
  @IsUUID()
  sucursalId?: string;
}
