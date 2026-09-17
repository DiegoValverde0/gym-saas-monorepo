import { IsNotEmpty, IsOptional, IsUUID, IsDateString } from 'class-validator';

export class CreateMembresiaDto {
  @IsUUID()
  @IsNotEmpty()
  clienteId: string;

  @IsUUID()
  @IsNotEmpty()
  planId: string;

  @IsUUID()
  @IsOptional()
  promocionId?: string;

  @IsUUID()
  @IsOptional()
  sucursalId?: string;

  @IsDateString()
  @IsOptional()
  fechaInicio?: string;
}
