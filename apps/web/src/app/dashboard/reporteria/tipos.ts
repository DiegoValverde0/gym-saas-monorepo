// Reportería (docs/plan-reporteria.md): tipos de la API /reporteria y
// nombres legibles. La definición es la misma que valida el backend en
// apps/api/src/modules/reporteria/motor/definicion.ts.

import { bs } from '@/lib/formato';

export type TipoDato = 'texto' | 'numero' | 'moneda' | 'fecha' | 'fechaHora' | 'booleano' | 'lista';
export type RangoFecha =
  | 'todo'
  | 'hoy'
  | 'ayer'
  | 'esta_semana'
  | 'semana_pasada'
  | 'este_mes'
  | 'mes_pasado'
  | 'ultimos_7'
  | 'ultimos_30'
  | 'ultimos_90'
  | 'este_anio'
  | 'anio_pasado'
  | 'proximos_7'
  | 'proximos_30'
  | 'personalizado';
export type Granularidad = 'dia' | 'semana' | 'mes' | 'anio';
export type FuncionTotal = 'suma' | 'promedio' | 'minimo' | 'maximo' | 'distintos';
export type TipoGrafico = 'barras' | 'lineas' | 'torta' | 'area' | 'barrasH' | 'calor';
export type Operador =
  | 'igual'
  | 'distinto'
  | 'contiene'
  | 'no_contiene'
  | 'empieza'
  | 'mayor'
  | 'mayor_igual'
  | 'menor'
  | 'menor_igual'
  | 'entre'
  | 'antes'
  | 'despues'
  | 'en'
  | 'no_en'
  | 'es_verdadero'
  | 'es_falso'
  | 'vacio'
  | 'no_vacio';

export interface ColumnaCatalogo {
  clave: string;
  nombre: string;
  grupo: string;
  tipo: TipoDato;
  opciones?: Record<string, string>;
  ayuda?: string;
  agrupable: boolean;
}

export interface TipoCatalogo {
  clave: string;
  nombre: string;
  descripcion: string;
  fila: string;
  fechaPorDefecto: string;
  rangoPorDefecto: RangoFecha;
  columnasIniciales: string[];
  tieneSoloMios: boolean;
  columnas: ColumnaCatalogo[];
  /** Filtros "con / sin" (modo experto). */
  cruzados: { clave: string; nombre: string; conRango: boolean }[];
}

export interface Catalogo {
  modo: 'simple' | 'intermedio' | 'experto';
  /** Tabla cruzada, filtros con/sin, lógica y grupos personalizados (modo experto). */
  avanzado: boolean;
  operadores: Record<TipoDato, Operador[]>;
  maxFilasEnPantalla: number;
  tipos: TipoCatalogo[];
}

export interface FiltroCampo {
  columna: string;
  operador: Operador;
  valor?: string | number;
  valorHasta?: string | number;
  valores?: string[];
}

export interface GrupoPersonalizado {
  clave: string;
  nombre: string;
  columna: string;
  rangos?: { hasta: number; etiqueta: string }[];
  valores?: { etiqueta: string; valores: string[] }[];
  otros: string;
}

export interface FiltroCruzado {
  clave: string;
  modo: 'con' | 'sin';
  rango?: RangoFecha;
}

export interface Definicion {
  version?: number;
  tipo: string;
  formato: 'LISTA' | 'AGRUPADO' | 'TABLA_CRUZADA';
  columnas: string[];
  /** Agrupado: los niveles. Tabla cruzada: las filas. */
  agrupaciones: { columna: string; granularidad?: Granularidad }[];
  /** Tabla cruzada: lo que va en las columnas. */
  columnaCruzada?: { columna: string; granularidad?: Granularidad };
  gruposPersonalizados?: GrupoPersonalizado[];
  totales: { columna: string; funcion: FuncionTotal }[];
  mostrarDetalle: boolean;
  filtros: {
    fecha: { columna: string; rango: RangoFecha; desde?: string; hasta?: string };
    sucursalId?: string;
    soloMios: boolean;
    campos: FiltroCampo[];
    /** "1 Y (2 O 3)" */
    logica?: string;
    cruzados?: FiltroCruzado[];
  };
  orden: { columna: string; direccion: 'asc' | 'desc' }[];
  /** Agrupado o tabla cruzada. valor: "cantidad" o un total, como "suma:monto". */
  grafico?: { tipo: TipoGrafico; valor: string; destacar?: boolean };
}

export interface Resumen {
  nivel: number;
  grupo: unknown[];
  cantidad: number;
  totales: (number | string | null)[];
  /** Tabla cruzada: la casilla de esta columna (sin esto, el total de la fila). */
  columna?: unknown;
  conColumna?: boolean;
}

export interface Resultado {
  definicion: Definicion;
  columnas: { clave: string; nombre: string; tipo: TipoDato; opciones?: Record<string, string> }[];
  agrupaciones: { clave: string; nombre: string; tipo: TipoDato; granularidad?: Granularidad; opciones?: Record<string, string> }[];
  columnaCruzada?: { clave: string; nombre: string; tipo: TipoDato; granularidad?: Granularidad; opciones?: Record<string, string> };
  totales: { clave: string; funcion: FuncionTotal; nombre: string; tipo: TipoDato }[];
  filas: Record<string, unknown>[] | null;
  resumenes: Resumen[];
  totalFilas: number;
  pagina: number;
  porPagina: number;
  recortado: boolean;
  gruposRecortados: boolean;
}

export interface ReporteGuardado {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipo: { clave: string; nombre: string };
  formato: 'LISTA' | 'AGRUPADO' | 'TABLA_CRUZADA';
  esPlantilla: boolean;
  /** La clave de la plantilla del sistema (para el Inicio). */
  clavePlantilla?: string | null;
  carpeta: { id: string; nombre: string } | null;
  creadoPor: string | null;
  esMio: boolean;
  ultimaEjecucion: string | null;
  vecesEjecutado: number;
  modificadoEl: string;
  eliminadoEl: string | null;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  definicion?: Definicion;
  /** Usa tabla cruzada, filtros con/sin, lógica o grupos personalizados. */
  usaModoExperto?: boolean;
  /** En la lista: la forma de su gráfico, si tiene (la galería del Inicio). */
  grafico?: TipoGrafico | null;
}

export interface Carpeta {
  id: string;
  nombre: string;
  descripcion: string | null;
  visibilidad: 'PRIVADA' | 'COMPARTIDA';
  roles: { id: string; nombre: string }[];
  creadaPor: string | null;
  esMia: boolean;
  cantidadReportes: number;
  puedeEditar: boolean;
  puedeEliminar: boolean;
}

// ---- Nombres legibles

export const NOMBRE_RANGO: Record<RangoFecha, string> = {
  todo: 'Todas las fechas',
  hoy: 'Hoy',
  ayer: 'Ayer',
  esta_semana: 'Esta semana',
  semana_pasada: 'La semana pasada',
  este_mes: 'Este mes',
  mes_pasado: 'El mes pasado',
  ultimos_7: 'Últimos 7 días',
  ultimos_30: 'Últimos 30 días',
  ultimos_90: 'Últimos 90 días',
  este_anio: 'Este año',
  anio_pasado: 'El año pasado',
  proximos_7: 'Próximos 7 días',
  proximos_30: 'Próximos 30 días',
  personalizado: 'Elegir fechas…',
};

export const NOMBRE_OPERADOR: Record<Operador, string> = {
  igual: 'es igual a',
  distinto: 'no es igual a',
  contiene: 'contiene',
  no_contiene: 'no contiene',
  empieza: 'empieza con',
  mayor: 'es mayor que',
  mayor_igual: 'es mayor o igual que',
  menor: 'es menor que',
  menor_igual: 'es menor o igual que',
  entre: 'está entre',
  antes: 'es antes del',
  despues: 'es después del',
  en: 'es alguno de',
  no_en: 'no es ninguno de',
  es_verdadero: 'es sí',
  es_falso: 'es no',
  vacio: 'está vacío',
  no_vacio: 'no está vacío',
};

export const NOMBRE_GRANULARIDAD: Record<Granularidad, string> = { dia: 'Por día', semana: 'Por semana', mes: 'Por mes', anio: 'Por año' };

export const NOMBRE_GRAFICO: Record<TipoGrafico, string> = { barras: 'Barras', lineas: 'Líneas', torta: 'Torta', area: 'Área', barrasH: 'Barras horizontales', calor: 'Mapa de calor' };

export const NOMBRE_FUNCION: Record<FuncionTotal, string> = {
  suma: 'Suma',
  promedio: 'Promedio',
  minimo: 'Mínimo',
  maximo: 'Máximo',
  distintos: 'Distintos',
};

// Operadores que no piden un valor.
export const SIN_VALOR: Operador[] = ['vacio', 'no_vacio', 'es_verdadero', 'es_falso'];

// ---- Formato de valores

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ddmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

export function formatearValor(
  valor: unknown,
  tipo: TipoDato,
  opciones?: Record<string, string>,
  granularidad?: Granularidad,
): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (granularidad && typeof valor === 'string') {
    const [a, m] = valor.split('-');
    if (granularidad === 'anio') return a;
    if (granularidad === 'mes') return `${MESES[Number(m) - 1].replace(/^./, (c) => c.toUpperCase())} ${a}`;
    if (granularidad === 'semana') return `Semana del ${ddmmaaaa(valor)}`;
    return ddmmaaaa(valor);
  }
  switch (tipo) {
    case 'moneda':
      return bs(Number(valor));
    case 'numero':
      return Number(valor).toLocaleString('es-ES', { maximumFractionDigits: 2 });
    case 'fecha':
      return ddmmaaaa(String(valor));
    case 'fechaHora':
      return new Date(String(valor)).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    case 'booleano':
      return valor ? 'Sí' : 'No';
    case 'lista':
      return opciones?.[String(valor)] ?? String(valor);
    default:
      return String(valor);
  }
}

/**
 * El tipo con las columnas de los grupos personalizados de la definición
 * (son columnas de texto más, para elegir, agrupar y filtrar).
 */
export function conGruposPersonalizados(tipo: TipoCatalogo, grupos: GrupoPersonalizado[] = []): TipoCatalogo {
  if (grupos.length === 0) return tipo;
  return {
    ...tipo,
    columnas: [
      ...tipo.columnas,
      ...grupos.map((g) => ({ clave: g.clave, nombre: g.nombre, grupo: 'Grupos personalizados', tipo: 'texto' as const, agrupable: true })),
    ],
  };
}

/** Una definición nueva para un tipo, con sus columnas iniciales. */
export function definicionInicial(tipo: TipoCatalogo): Definicion {
  return {
    tipo: tipo.clave,
    formato: 'LISTA',
    columnas: [...tipo.columnasIniciales],
    agrupaciones: [],
    totales: [],
    mostrarDetalle: true,
    // Por lo general los últimos 30 días ("este mes" sale vacío a principio
    // de mes); Clientes e Inventario arrancan con todas las fechas.
    filtros: { fecha: { columna: tipo.fechaPorDefecto, rango: tipo.rangoPorDefecto }, soloMios: false, campos: [] },
    orden: [],
  };
}
