import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

// Campos que el propio tenant (dueño de gym) puede editar de su organización.
// Deliberadamente NO incluye `estado`, `deletedAt` ni `identificacionFiscal`:
// esos quedan fuera del alcance de autoedición del tenant.
export class UpdateMiOrganizacionDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  razonSocial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  moneda?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  zonaHoraria?: string;

  // `any` deliberado: Prisma exige su propio tipo recursivo InputJsonValue
  // para columnas JSON, incompatible estructuralmente con un Record simple.
  // class-validator igual valida en runtime que sea un objeto.
  @IsOptional()
  @IsObject()
  configuracion?: any;
}
