import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class IngresoKioscoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  documento: string;

  @IsUUID()
  sucursalId: string;
}

export class PinKioscoDto {
  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'El PIN son de 4 a 6 números.' })
  pin: string;
}

// Sin `pin` se quita el PIN del kiosco.
export class DefinirPinKioscoDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'El PIN son de 4 a 6 números.' })
  pin?: string;
}
