import { IsUUID, IsString, IsNotEmpty, IsOptional, IsEnum, IsInt, Min, IsDateString, IsIn } from 'class-validator';
import { EstadoGeneral } from '@prisma/client';

export class CreateClaseProgramadaDto {
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

  @IsDateString()
  @IsNotEmpty()
  fechaHora: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  duracionMinutos?: number;

  @IsEnum(EstadoGeneral)
  @IsOptional()
  estado?: EstadoGeneral;
}
