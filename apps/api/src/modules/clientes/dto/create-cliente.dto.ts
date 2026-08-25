import { IsString, IsNotEmpty, IsOptional, IsEmail, IsUUID } from 'class-validator';

export class CreateClienteDto {
  @IsUUID()
  @IsNotEmpty()
  sucursal_base_id: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsEmail()
  @IsOptional()
  correo?: string;
}
