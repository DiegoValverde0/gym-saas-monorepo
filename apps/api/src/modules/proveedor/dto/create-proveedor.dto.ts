import { IsString, IsNotEmpty, IsOptional, IsEmail, IsEnum, ValidateIf } from 'class-validator';
import { EstadoGeneral, TipoConceptoVenta } from '@prisma/client';

export class CreateProveedorDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsOptional()
  numeroDocumento?: string;

  @IsString()
  @IsOptional()
  telefono?: string;

  // @ValidateIf en vez de @IsOptional: mismo motivo que create-cliente.dto.ts
  // -- un string vacío no debe disparar @IsEmail().
  @ValidateIf((o) => o.correo !== undefined && o.correo !== null && o.correo !== '')
  @IsEmail()
  correo?: string;

  @IsEnum(TipoConceptoVenta)
  @IsOptional()
  categoriaDefault?: TipoConceptoVenta;

  @IsEnum(EstadoGeneral)
  @IsOptional()
  estado?: EstadoGeneral;
}
