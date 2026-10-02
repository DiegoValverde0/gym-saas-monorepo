import { Prisma } from '@prisma/client';
import { ModuloTenant } from '../../../common/decorators/requiere-modulo.decorator';

// Catálogo de tipos de reporte (docs/plan-reporteria.md, sección 3.1). Todo
// el SQL de este catálogo es FIJO y escrito aquí: el motor solo arma la
// consulta con estas piezas (lista blanca). Lo que manda el usuario (valores
// de filtros, fechas, sucursal) entra siempre como parámetro.

export type TipoDato = 'texto' | 'numero' | 'moneda' | 'fecha' | 'fechaHora' | 'booleano' | 'lista';

/** Datos de la ejecución que pueden usar las columnas calculadas. */
export interface ContextoSql {
  zonaHoraria: string;
}

// Una expresión del catálogo: texto SQL fijo, o una función que devuelve SQL
// con parámetros (por ejemplo, la zona horaria del gimnasio).
export type ExpresionSql = string | ((ctx: ContextoSql) => Prisma.Sql);

export interface ColumnaCatalogo {
  clave: string;
  nombre: string;
  /** Origen, para agrupar el panel de columnas ("Venta", "Cliente", "Plan"...). */
  grupo: string;
  tipo: TipoDato;
  sql: ExpresionSql;
  /** Alias de las relaciones que necesita (la tabla principal no hace falta). */
  usa?: string[];
  /** Valores posibles y su nombre legible (tipo "lista"). */
  opciones?: Record<string, string>;
  /** Se puede agrupar por esta columna (por defecto, sí salvo fecha y hora exacta). */
  agrupable?: boolean;
  /** Ayuda corta para el panel de columnas. */
  ayuda?: string;
  /** Orden de los grupos cuando no es el alfabético (tramos de un grupo personalizado). */
  orden?: ExpresionSql;
}

/** Contexto de un filtro "con / sin": la zona horaria y las fechas del gimnasio como instantes. */
export interface ContextoCruzado extends ContextoSql {
  inicioDelDia: (fecha: string) => Date;
}

/**
 * Filtro "con / sin" (Salesforce: cross filter): "clientes CON asistencias en
 * los últimos 30 días", "clientes SIN membresía activa". `existe` devuelve un
 * EXISTS (...) correlacionado con la fila; desde/hasta son fechas locales
 * ("hasta" excluido) cuando el filtro usa un rango.
 */
export interface CruzadoCatalogo {
  clave: string;
  /** "asistencias", "membresía activa"... (se lee "con ..." / "sin ..."). */
  nombre: string;
  conRango: boolean;
  existe: (ctx: ContextoCruzado, desde?: string, hasta?: string) => Prisma.Sql;
}

/** Condición de rango sobre una columna con hora (timestamptz), en fechas del gimnasio. */
export function entreFechas(columna: string, ctx: ContextoCruzado, desde?: string, hasta?: string): Prisma.Sql {
  const partes: Prisma.Sql[] = [];
  if (desde) partes.push(Prisma.sql` AND ${Prisma.raw(columna)} >= ${ctx.inicioDelDia(desde)}`);
  if (hasta) partes.push(Prisma.sql` AND ${Prisma.raw(columna)} < ${ctx.inicioDelDia(hasta)}`);
  return partes.length ? Prisma.join(partes, '') : Prisma.empty;
}

export interface RelacionCatalogo {
  alias: string;
  /** JOIN fijo, por ejemplo "LEFT JOIN clientes c ON c.id = t.cliente_id". */
  sql: string;
  /** Otras relaciones que tienen que ir antes (por ejemplo, planes necesita membresías). */
  requiere?: string[];
}

export interface TipoReporte {
  clave: string;
  nombre: string;
  descripcion: string;
  /** "Una fila por cada ..." */
  fila: string;
  /** Permiso del módulo que exige, además de reportes:leer. */
  permiso: string;
  moduloGimnasio?: ModuloTenant;
  tabla: { nombre: string; alias: string; tieneDeletedAt: boolean };
  /** Relaciones que siempre van (INNER JOIN) y condiciones fijas de la fila. */
  obligatorias?: string[];
  condiciones?: string[];
  relaciones: RelacionCatalogo[];
  /** Columna de sucursal para el alcance y el filtro rápido. */
  sucursal: { sql: string; usa?: string[]; opcional: boolean };
  /** Quién lo creó, para "solo míos". */
  creadoPor?: { sql: string; usa?: string[] };
  /** Columna de fecha del filtro rápido por defecto. */
  fechaPorDefecto: string;
  /**
   * Rango con el que arranca un reporte nuevo (por defecto, los últimos 30
   * días). Inventario arranca con "Todas las fechas": es una foto de hoy.
   */
  rangoPorDefecto?: 'todo' | 'este_mes' | 'ultimos_30' | 'ultimos_90' | 'proximos_7' | 'proximos_30';
  columnas: ColumnaCatalogo[];
  /** Columnas que se proponen al crear un reporte nuevo. */
  columnasIniciales: string[];
  /** Filtros "con / sin" disponibles (modo experto). */
  cruzados?: CruzadoCatalogo[];
}

// Nombres legibles compartidos entre tipos.
export const NOMBRES = {
  concepto: {
    MEMBRESIA: 'Membresía',
    PRODUCTO: 'Producto',
    SERVICIO: 'Servicio',
    OTRO: 'Otro cobro',
    ALQUILER: 'Alquiler',
    SERVICIOS_BASICOS: 'Servicios básicos',
    NOMINA: 'Nómina',
    INSUMOS: 'Insumos',
    MANTENIMIENTO: 'Mantenimiento',
    IMPUESTOS: 'Impuestos',
    OTRO_GASTO: 'Otro gasto',
  },
  tipoPlan: { TIEMPO: 'Por tiempo', SESIONES: 'Por sesiones', VISITA: 'Visita del día' },
  estadoMembresia: {
    PENDIENTE_PAGO: 'Por pagar',
    EN_ESPERA: 'Por empezar',
    ACTIVA: 'Activa',
    VENCIDA: 'Vencida',
    CANCELADA: 'Anulada',
    AGOTADA: 'Sin sesiones',
    CONGELADA: 'En pausa',
  },
  tipoAsistencia: { MIEMBRO: 'Miembro', INVITADO: 'Invitado', VISITA_DIA: 'Visita del día', PRUEBA_GRATIS: 'Prueba gratis' },
  metodoValidacion: { MANUAL: 'Manual', TARJETA: 'Tarjeta', BIOMETRICO: 'Biométrico', QR: 'QR', CODIGO_PIN: 'Código PIN' },
  mesDelAnio: { '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril', '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto', '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre' },
  diaSemana: { '1': 'Lunes', '2': 'Martes', '3': 'Miércoles', '4': 'Jueves', '5': 'Viernes', '6': 'Sábado', '7': 'Domingo' },
  metodoPago: { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia', QR: 'QR', PAGO_MOVIL: 'Pago móvil', OTRO: 'Otro' },
  estadoReserva: { CONFIRMADA: 'Confirmada', CANCELADA: 'Cancelada', ASISTIO: 'Asistió', NO_ASISTIO: 'No asistió', EN_ESPERA: 'En lista de espera' },
  estadoTurno: { PROGRAMADO: 'Programada', COMPLETADO: 'Completada', AUSENTE: 'Ausente', CANCELADO: 'Cancelada' },
  estadoApertura: { ABIERTA: 'Abierta', CERRADA: 'Cerrada' },
  estadoClase: { ACTIVO: 'Programada', INACTIVO: 'Cancelada' },
  genero: { MASCULINO: 'Masculino', FEMENINO: 'Femenino', OTRO: 'Otro', PREFIERE_NO_INFORMAR: 'Prefiere no decir' },
  estadoCliente: { ACTIVO: 'Activo', INACTIVO: 'Inactivo', MOROSO: 'Con deuda', SUSPENDIDO: 'Suspendido' },
  contratacion: { PLANILLA: 'En planilla', INDEPENDIENTE: 'Independiente', VOLUNTARIO: 'Voluntario' },
} as const;

// Hora local del gimnasio de un timestamptz, para columnas calculadas.
export const enHoraLocal = (columna: string) => (ctx: ContextoSql) =>
  Prisma.sql`(${Prisma.raw(columna)} AT TIME ZONE ${ctx.zonaHoraria})`;
