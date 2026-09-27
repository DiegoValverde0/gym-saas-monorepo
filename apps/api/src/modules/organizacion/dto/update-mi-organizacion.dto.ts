import { IsOptional, IsString, MaxLength, IsBoolean, ValidateNested, IsIn, IsInt, Min, Max } from 'class-validator';
import { MODOS_USO, ModoUso } from '../../../common/utils/modo.util';
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

// Reglas de clases que se editan desde Configuración (modo experto).
export class ClasesConfigDto {
  // Decisión D4: asistir a una clase descuenta una sesión a los planes por
  // sesiones (por defecto no: solo el ingreso al gimnasio descuenta).
  @IsOptional()
  @IsBoolean()
  descontarSesionEnClase?: boolean;
}

// Jornadas del equipo (plan 7.2): minutos de gracia antes de mostrar a
// alguien como atrasado. Por defecto 10.
export class JornadasConfigDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  toleranciaAtrasoMinutos?: number;
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

export const TIPOS_GIMNASIO = ['musculacion', 'box', 'estudio', 'artes_marciales', 'otro'] as const;
export const TAMANOS_EQUIPO = ['solo', 'pequeno', 'grande'] as const;

// Respuestas del asistente de inicio (plan 4.5). Solo informativas: el modo y
// los módulos que se eligieron se guardan aparte.
export class OnboardingConfigDto {
  @IsOptional()
  @IsIn(TIPOS_GIMNASIO)
  tipoGimnasio?: (typeof TIPOS_GIMNASIO)[number];

  @IsOptional()
  @IsIn(TAMANOS_EQUIPO)
  tamanoEquipo?: (typeof TAMANOS_EQUIPO)[number];

  @IsOptional()
  @IsBoolean()
  clasesGrupales?: boolean;

  // true cuando el administrador terminó (o saltó) el asistente.
  @IsOptional()
  @IsBoolean()
  completado?: boolean;

  // true cuando cerró la lista de primeros pasos del Dashboard.
  @IsOptional()
  @IsBoolean()
  primerosPasosOcultos?: boolean;
}

export class ConfiguracionTenantDto {
  @IsOptional()
  @IsIn(MODOS_USO)
  modoUso?: ModoUso;

  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardingConfigDto)
  onboarding?: OnboardingConfigDto;

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

  @IsOptional()
  @ValidateNested()
  @Type(() => ClasesConfigDto)
  clases?: ClasesConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => JornadasConfigDto)
  jornadas?: JornadasConfigDto;
}

// Asistente de inicio (plan 4.5): aplica modo y módulos elegidos, guarda las
// respuestas y, si se pide, crea datos de ejemplo.
export class InicioOrganizacionDto {
  @IsIn(MODOS_USO)
  modoUso: ModoUso;

  @ValidateNested()
  @Type(() => ModulosConfigDto)
  modulos: ModulosConfigDto;

  @ValidateNested()
  @Type(() => OnboardingConfigDto)
  respuestas: OnboardingConfigDto;

  @IsBoolean()
  crearEjemplos: boolean;
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
