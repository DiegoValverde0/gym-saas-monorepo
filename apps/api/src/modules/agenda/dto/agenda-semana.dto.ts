import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class AgendaSemanaDto {
  @IsUUID()
  sucursalId: string;

  // Cualquier día de la semana a mostrar (YYYY-MM-DD, fecha local de la
  // organización). Sin él, la semana actual.
  @IsOptional()
  @IsDateString()
  fecha?: string;
}
