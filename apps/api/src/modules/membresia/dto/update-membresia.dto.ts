import { IsEnum, IsOptional } from 'class-validator';
import { EstadoMembresia } from '@prisma/client';

export class UpdateMembresiaDto {
  @IsEnum(EstadoMembresia)
  @IsOptional()
  estado?: EstadoMembresia;
}
