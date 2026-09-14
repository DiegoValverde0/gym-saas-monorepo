import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { EstadoCaja } from '@prisma/client';

export class CreateCajaRegistradoraDto {
  @IsString()
  nombre: string;

  @IsUUID()
  sucursalId: string;

  @IsOptional()
  @IsEnum(EstadoCaja)
  estado?: EstadoCaja;
}
