import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class ReservarClasePortalDto {
  // Si la clase está llena, anotarse en la lista de espera.
  @IsOptional()
  @IsBoolean()
  listaEspera?: boolean;
}

export class CambiarContrasenaPortalDto {
  @IsString()
  actual: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña nueva debe tener al menos 8 caracteres.' })
  nueva: string;
}
