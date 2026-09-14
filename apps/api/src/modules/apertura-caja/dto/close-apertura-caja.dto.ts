import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CloseAperturaCajaDto {
  @IsNumber()
  @Min(0)
  montoCierreReal: number;

  @IsNumber()
  @Min(0)
  montoExtraido: number;

  @IsString()
  @IsOptional()
  observaciones?: string;
}
