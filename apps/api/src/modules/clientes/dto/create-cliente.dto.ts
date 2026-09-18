import { IsString, IsNotEmpty, IsOptional, IsEmail, IsUUID, IsEnum, IsDateString, IsBoolean, ValidateIf } from 'class-validator';
import { TipoDocumento, Genero, EstadoCliente } from '@prisma/client';

export class CreateClienteDto {
  @IsUUID()
  @IsOptional()
  sucursalBaseId?: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  // @ValidateIf en vez de @IsOptional: un string vacío ('' , el valor por
  // defecto del formulario cuando la organización no exige correo) no debe
  // disparar @IsEmail(). @IsOptional() solo ignora null/undefined, no ''.
  @ValidateIf((o) => o.correo !== undefined && o.correo !== null && o.correo !== '')
  @IsEmail()
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
