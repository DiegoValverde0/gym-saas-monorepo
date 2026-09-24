import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsEmail, IsOptional, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';
import { CreatePersonalDto } from './create-personal.dto';
import { HorarioSemanalDto } from '../../turno-plantilla/dto/horario-semanal.dto';

// Alta de una persona del equipo en un solo paso: cuenta de acceso (usuario +
// rol), perfil de staff (contratación, disciplinas) y horario semanal. Antes
// eran tres pantallas distintas (Usuarios, Personal, Turnos > Plantillas).
export class CreateMiembroEquipoDto extends OmitType(CreatePersonalDto, ['usuarioId'] as const) {
  @IsString()
  @MinLength(2)
  nombreCompleto: string;

  @IsEmail()
  correo: string;

  // Se ignora si el correo ya tenía cuenta en la plataforma (ver PersonalService.crearMiembro).
  @IsString()
  @MinLength(8)
  contrasena: string;

  @IsString()
  @IsOptional()
  telefono?: string;

  @IsUUID()
  rolId: string;

  // Sucursal a la que queda limitado su acceso. Ausente o null = todas.
  @IsUUID()
  @IsOptional()
  sucursalId?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => HorarioSemanalDto)
  horario?: HorarioSemanalDto;
}

// El correo y la contraseña no se editan desde acá (el correo identifica la
// cuenta en toda la plataforma).
export class UpdateMiembroEquipoDto extends PartialType(OmitType(CreateMiembroEquipoDto, ['correo', 'contrasena'] as const)) {}
