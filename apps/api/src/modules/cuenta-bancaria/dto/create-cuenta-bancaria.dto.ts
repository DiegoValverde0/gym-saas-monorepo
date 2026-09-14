import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateCuentaBancariaDto {
  @IsString()
  @IsNotEmpty()
  banco: string;

  @IsString()
  @IsNotEmpty()
  numeroCuenta: string;

  @IsString()
  @IsOptional()
  tipoCuenta?: string;

  @IsString()
  @IsOptional()
  moneda?: string;
}
