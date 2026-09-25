import { IsUUID, IsString, IsNotEmpty, IsOptional, IsInt, Min, Max, IsDateString, IsBoolean, IsIn } from 'class-validator';

export class CreateClasePlantillaDto {
  @IsUUID()
  sucursalId: string;

  @IsUUID()
  @IsOptional()
  disciplinaId?: string;

  @IsUUID()
  @IsOptional()
  entrenadorId?: string;

  // Fase 6 (DB-2): sala opcional de la sucursal.
  @IsUUID()
  @IsOptional()
  salaId?: string | null;

  // Fase 6 (DB-1): quién puede reservar esta clase; sin valor, la regla de su
  // disciplina.
  @IsIn(['ABIERTA', 'MIEMBROS', 'PLANES'])
  @IsOptional()
  acceso?: 'ABIERTA' | 'MIEMBROS' | 'PLANES' | null;

  @IsString()
  @IsNotEmpty()
  nombreClase: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  capacidadMaxima?: number;

  // 0 = domingo ... 6 = sábado (Date#getUTCDay()).
  @IsInt()
  @Min(0)
  @Max(6)
  diaSemana: number;

  @IsString()
  @IsNotEmpty()
  horaInicio: string; // "HH:MM"

  @IsInt()
  @Min(1)
  @IsOptional()
  duracionMinutos?: number;

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
