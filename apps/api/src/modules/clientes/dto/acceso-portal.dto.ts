import { Transform } from 'class-transformer';
import { IsEmail, IsOptional } from 'class-validator';

export class DarAccesoPortalDto {
  // Si no viene, se usa el correo de la ficha. Se limpia antes de validar:
  // " Pedro@Mail.com " copiado de un chat es un correo válido.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'El correo no es válido.' })
  correo?: string;
}
