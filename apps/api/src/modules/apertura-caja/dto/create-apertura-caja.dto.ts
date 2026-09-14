import { IsNumber, IsNotEmpty, IsUUID, Min } from 'class-validator';

export class CreateAperturaCajaDto {
  @IsUUID()
  @IsNotEmpty()
  cajaId: string;

  @IsNumber()
  @Min(0)
  montoInicial: number;
}
