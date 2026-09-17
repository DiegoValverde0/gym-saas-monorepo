import { IsUUID, IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { EstadoTurno } from '@prisma/client';

export class CreateTurnoTrabajoDto {
  @IsUUID()
  staffId: string;

  @IsUUID()
  sucursalId: string;

  @IsDateString()
  @IsNotEmpty()
  fecha: string;

  @IsString()
  @IsNotEmpty()
  horaEntrada: string; // "HH:MM"

  @IsString()
  @IsNotEmpty()
  horaSalida: string; // "HH:MM"

  @IsDateString()
  @IsOptional()
  horaIngresoReal?: string;

  @IsDateString()
  @IsOptional()
  horaSalidaReal?: string;

  @IsEnum(EstadoTurno)
  @IsOptional()
  estado?: EstadoTurno;

  @IsString()
  @IsOptional()
  motivoAusencia?: string;
}
