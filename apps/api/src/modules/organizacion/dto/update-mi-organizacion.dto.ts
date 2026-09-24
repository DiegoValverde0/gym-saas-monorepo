import { IsOptional, IsString, MaxLength, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ModulosConfigDto {
  @IsOptional()
  @IsBoolean()
  puntoVenta?: boolean;

  @IsOptional()
  @IsBoolean()
  clasesGrupales?: boolean;

  @IsOptional()
  @IsBoolean()
  controlPersonal?: boolean;

  @IsOptional()
  @IsBoolean()
  reportesAvanzados?: boolean;

  @IsOptional()
  @IsBoolean()
  controlGastos?: boolean;

  @IsOptional()
  @IsBoolean()
  controlAcceso?: boolean;
}

export class RequerimientosClienteConfigDto {
  @IsOptional()
  @IsBoolean()
  exigirDni?: boolean;

  @IsOptional()
  @IsBoolean()
  exigirCorreo?: boolean;

  @IsOptional()
  @IsBoolean()
  exigirTelefono?: boolean;

  @IsOptional()
  @IsBoolean()
  exigirHuella?: boolean;
}

export class RequerimientosClaseConfigDto {
  // false/undefined (default): si el entrenador no tiene turno registrado en
  // el horario de la clase, se avisa pero se deja guardar. true: se bloquea
  // el guardado hasta que haya un turno que cubra ese horario.
  @IsOptional()
  @IsBoolean()
  exigirTurnoEntrenador?: boolean;
}

export class PreferenciasOperativasConfigDto {
  @IsOptional()
  @IsBoolean()
  renovacionAutomaticaPlanes?: boolean;

  @IsOptional()
  @IsString()
  impresionTickets?: string;

  @IsOptional()
  @IsBoolean()
  notificacionesWhatsapp?: boolean;
}

export class ConfiguracionTenantDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ModulosConfigDto)
  modulos?: ModulosConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RequerimientosClienteConfigDto)
  requerimientosCliente?: RequerimientosClienteConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RequerimientosClaseConfigDto)
  requerimientosClase?: RequerimientosClaseConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PreferenciasOperativasConfigDto)
  preferenciasOperativas?: PreferenciasOperativasConfigDto;
}

// Campos que el propio tenant (dueño de gym) puede editar de su organización.
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
  @MaxLength(150)
  emailContacto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  identificacionFiscal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  moneda?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  zonaHoraria?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConfiguracionTenantDto)
  configuracion?: ConfiguracionTenantDto;
}
