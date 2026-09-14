import { IsString, IsNotEmpty, IsOptional, IsUUID, IsBoolean, IsEnum } from 'class-validator';
import { TipoAsistencia } from '@prisma/client';

export class CreateAsistenciaDto {
  @IsUUID()
  @IsOptional()
  clienteId?: string;

  @IsUUID()
  @IsNotEmpty()
  sucursalId: string;

  @IsString()
  @IsOptional()
  nombreVisitante?: string;

  @IsEnum(TipoAsistencia)
  @IsOptional()
  tipoAsistencia?: TipoAsistencia;

  @IsBoolean()
  @IsOptional()
  forzarIngreso?: boolean;
  
  @IsString()
  @IsOptional()
  motivoForzado?: string;
}

export class ValidateAsistenciaDto {
  @IsUUID()
  @IsNotEmpty()
  clienteId: string;
}
