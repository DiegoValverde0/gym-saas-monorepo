import { IsString, IsNotEmpty, IsOptional, IsEmail, IsUUID, IsEnum, IsDateString, IsBoolean } from 'class-validator';
import { TipoDocumento, Genero, EstadoCliente } from '@prisma/client';

export class CreateClienteDto {
  @IsUUID()
  @IsOptional()
  sucursalBaseId?: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsEmail()
  @IsOptional()
  correo?: string;

  @IsString()
  @IsOptional()
  telefono?: string;

  @IsEnum(TipoDocumento)
  @IsOptional()
  tipoDocumento?: TipoDocumento;

  @IsString()
  @IsOptional()
  numeroDocumento?: string;

  @IsDateString()
  @IsOptional()
  fechaNacimiento?: string;

  @IsEnum(Genero)
  @IsOptional()
  genero?: Genero;

  @IsString()
  @IsOptional()
  direccion?: string;

  @IsString()
  @IsOptional()
  contactoEmergenciaNombre?: string;

  @IsString()
  @IsOptional()
  contactoEmergenciaTelefono?: string;

  @IsString()
  @IsOptional()
  condicionesMedicas?: string;

  @IsBoolean()
  @IsOptional()
  aceptaDeslindeResponsabilidad?: boolean;

  @IsEnum(EstadoCliente)
  @IsOptional()
  estado?: EstadoCliente;
}
