import { IsString, IsOptional, IsEmail, IsUUID, IsEnum } from 'class-validator';

// EstadoRegistro de Prisma enum
export enum EstadoRegistroDto {
  ACTIVO = 'ACTIVO',
  INACTIVO = 'INACTIVO',
  SUSPENDIDO = 'SUSPENDIDO',
}

export class UpdateClienteDto {
  @IsUUID()
  @IsOptional()
  sucursal_base_id?: string;

  @IsString()
  @IsOptional()
  nombre?: string;

  @IsEmail()
  @IsOptional()
  correo?: string;

  @IsEnum(EstadoRegistroDto)
  @IsOptional()
  estado?: EstadoRegistroDto;
}
