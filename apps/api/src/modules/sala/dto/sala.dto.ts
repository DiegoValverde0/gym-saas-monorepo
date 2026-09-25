import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSalaDto {
  @IsUUID()
  sucursalId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre: string;

  // Cupo de la sala: se propone como cupo de las clases que la usan.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacidad?: number | null;
}

export class UpdateSalaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacidad?: number | null;
}

export class SalasQueryDto {
  @IsOptional()
  @IsUUID()
  sucursalId?: string;
}
