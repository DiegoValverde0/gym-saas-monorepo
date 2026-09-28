import { BadRequestException } from '@nestjs/common';
import { ColumnaCatalogo, TipoDato, TipoReporte } from '../catalogo';

// Definición de un reporte (docs/plan-reporteria.md, sección 3.2): lo que se
// guarda en reportes.definicion y lo que manda el constructor. Se valida
// contra el catálogo en cada ejecución.

export const VERSION_DEFINICION = 1;
export const MAX_AGRUPACIONES = 3;
export const MAX_FILTROS = 20;
export const MAX_VALORES_LISTA = 50;
export const MAX_COLUMNAS = 40;

export const FORMATOS = ['LISTA', 'AGRUPADO'] as const;
export type Formato = (typeof FORMATOS)[number];

export const RANGOS_FECHA = [
  'todo',
  'hoy',
  'ayer',
  'esta_semana',
  'semana_pasada',
  'este_mes',
  'mes_pasado',
  'ultimos_7',
  'ultimos_30',
  'ultimos_90',
  'este_anio',
  'anio_pasado',
  'proximos_7',
  'proximos_30',
  'personalizado',
] as const;
export type RangoFecha = (typeof RANGOS_FECHA)[number];

export const GRANULARIDADES = ['dia', 'semana', 'mes', 'anio'] as const;
export type Granularidad = (typeof GRANULARIDADES)[number];

export const FUNCIONES_TOTAL = ['suma', 'promedio', 'minimo', 'maximo', 'distintos'] as const;
export type FuncionTotal = (typeof FUNCIONES_TOTAL)[number];

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

// Operadores que acepta cada tipo de dato.
export const OPERADORES: Record<TipoDato, Operador[]> = {
  texto: ['igual', 'distinto', 'contiene', 'no_contiene', 'empieza', 'vacio', 'no_vacio'],
  numero: ['igual', 'distinto', 'mayor', 'mayor_igual', 'menor', 'menor_igual', 'entre', 'vacio', 'no_vacio'],
  moneda: ['igual', 'distinto', 'mayor', 'mayor_igual', 'menor', 'menor_igual', 'entre', 'vacio', 'no_vacio'],
  fecha: ['igual', 'antes', 'despues', 'entre', 'vacio', 'no_vacio'],
  fechaHora: ['igual', 'antes', 'despues', 'entre', 'vacio', 'no_vacio'],
  booleano: ['es_verdadero', 'es_falso'],
  lista: ['en', 'no_en', 'vacio', 'no_vacio'],
};

export interface FiltroCampo {
  columna: string;
  operador: Operador;
  valor?: string | number;
  valorHasta?: string | number;
  valores?: string[];
}

export interface Agrupacion {
  columna: string;
  granularidad?: Granularidad;
}

export interface Total {
  columna: string;
  funcion: FuncionTotal;
}

export interface Definicion {
  version: number;
  tipo: string;
  formato: Formato;
  columnas: string[];
  agrupaciones: Agrupacion[];
  totales: Total[];
  /** Agrupado: mostrar también las filas de detalle bajo cada grupo. */
  mostrarDetalle: boolean;
  filtros: {
    fecha: { columna: string; rango: RangoFecha; desde?: string; hasta?: string };
    sucursalId?: string;
    soloMios: boolean;
    campos: FiltroCampo[];
  };
  orden: { columna: string; direccion: 'asc' | 'desc' }[];
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const error = (mensaje: string): never => {
  throw new BadRequestException(mensaje);
};

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function columnaDe(tipo: TipoReporte, clave: unknown, para: string): ColumnaCatalogo {
  const columna = typeof clave === 'string' ? tipo.columnas.find((c) => c.clave === clave) : undefined;
  if (!columna) error(`La columna "${String(clave)}" (${para}) no existe en el reporte de ${tipo.nombre}.`);
  return columna!;
}

const esNumero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));

function validarValor(columna: ColumnaCatalogo, valor: unknown, que: string) {
  if (columna.tipo === 'numero' || columna.tipo === 'moneda') {
    if (!esNumero(valor)) error(`El filtro de "${columna.nombre}" necesita un número (${que}).`);
    return Number(valor);
  }
  if (columna.tipo === 'fecha' || columna.tipo === 'fechaHora') {
    if (typeof valor !== 'string' || !FECHA_ISO.test(valor) || Number.isNaN(Date.parse(`${valor}T00:00:00Z`))) {
      error(`El filtro de "${columna.nombre}" necesita una fecha AAAA-MM-DD (${que}).`);
    }
    return valor as string;
  }
  if (typeof valor !== 'string' && typeof valor !== 'number') error(`El filtro de "${columna.nombre}" necesita un valor (${que}).`);
  const texto = String(valor);
  if (texto.length > 200) error(`El valor del filtro de "${columna.nombre}" es demasiado largo.`);
  return texto;
}

/**
 * Valida y normaliza una definición contra el tipo de reporte. Devuelve una
 * definición completa (con valores por defecto) o lanza un error en
 * lenguaje claro. No acepta nada que no esté en el catálogo.
 */
export function validarDefinicion(entrada: unknown, tipo: TipoReporte): Definicion {
  if (!esObjeto(entrada)) error('La definición del reporte no es válida.');
  const d = entrada as Record<string, unknown>;
  if (d.tipo !== tipo.clave) error('El tipo de la definición no coincide con el reporte.');

  const formato = (d.formato ?? 'LISTA') as Formato;
  if (!FORMATOS.includes(formato)) error(`El formato "${String(d.formato)}" no está disponible.`);

  // Columnas
  const columnasEntrada = Array.isArray(d.columnas) ? d.columnas : tipo.columnasIniciales;
  if (columnasEntrada.length > MAX_COLUMNAS) error(`Un reporte puede tener hasta ${MAX_COLUMNAS} columnas.`);
  const columnas = [...new Set(columnasEntrada.map((c) => columnaDe(tipo, c, 'columnas').clave))];
  if (formato === 'LISTA' && columnas.length === 0) error('Elige al menos una columna.');

  // Agrupaciones
  const agrupacionesEntrada = Array.isArray(d.agrupaciones) ? d.agrupaciones : [];
  if (formato === 'LISTA' && agrupacionesEntrada.length > 0) error('Para agrupar, elige el formato "Agrupado".');
  if (formato === 'AGRUPADO' && agrupacionesEntrada.length === 0) error('Elige por qué columna agrupar.');
  if (agrupacionesEntrada.length > MAX_AGRUPACIONES) error(`Se puede agrupar por hasta ${MAX_AGRUPACIONES} columnas.`);
  const agrupaciones: Agrupacion[] = agrupacionesEntrada.map((a) => {
    if (!esObjeto(a)) error('Una agrupación no es válida.');
    const g = a as Record<string, unknown>;
    const columna = columnaDe(tipo, g.columna, 'agrupar');
    if (columna.agrupable === false) error(`No se puede agrupar por "${columna.nombre}".`);
    const esFecha = columna.tipo === 'fecha' || columna.tipo === 'fechaHora';
    if (esFecha) {
      const granularidad = (g.granularidad ?? 'dia') as Granularidad;
      if (!GRANULARIDADES.includes(granularidad)) error(`No se puede agrupar "${columna.nombre}" por "${String(g.granularidad)}".`);
      return { columna: columna.clave, granularidad };
    }
    if (g.granularidad !== undefined) error(`"${columna.nombre}" no es una fecha: no se agrupa por día, semana o mes.`);
    return { columna: columna.clave };
  });
  if (new Set(agrupaciones.map((a) => a.columna)).size !== agrupaciones.length) error('No se puede agrupar dos veces por la misma columna.');

  // Totales (la cantidad de filas va siempre)
  const totalesEntrada = Array.isArray(d.totales) ? d.totales : [];
  if (totalesEntrada.length > MAX_COLUMNAS) error('Demasiados totales.');
  const totales: Total[] = totalesEntrada.map((t) => {
    if (!esObjeto(t)) error('Un total no es válido.');
    const x = t as Record<string, unknown>;
    const columna = columnaDe(tipo, x.columna, 'totales');
    const funcion = x.funcion as FuncionTotal;
    if (!FUNCIONES_TOTAL.includes(funcion)) error(`El total "${String(x.funcion)}" no existe.`);
    const numerica = columna.tipo === 'numero' || columna.tipo === 'moneda';
    const comparable = numerica || columna.tipo === 'fecha' || columna.tipo === 'fechaHora';
    if ((funcion === 'suma' || funcion === 'promedio') && !numerica) error(`"${columna.nombre}" no es un número: no se puede sumar ni promediar.`);
    if ((funcion === 'minimo' || funcion === 'maximo') && !comparable) error(`"${columna.nombre}" no tiene mínimo ni máximo.`);
    return { columna: columna.clave, funcion };
  });

  // Filtros
  const f = esObjeto(d.filtros) ? (d.filtros as Record<string, unknown>) : {};
  const fechaEntrada = esObjeto(f.fecha) ? (f.fecha as Record<string, unknown>) : {};
  const columnaFecha = columnaDe(tipo, fechaEntrada.columna ?? tipo.fechaPorDefecto, 'filtro de fecha');
  if (columnaFecha.tipo !== 'fecha' && columnaFecha.tipo !== 'fechaHora') error(`"${columnaFecha.nombre}" no es una fecha.`);
  const rango = (fechaEntrada.rango ?? 'todo') as RangoFecha;
  if (!RANGOS_FECHA.includes(rango)) error(`El rango de fechas "${String(fechaEntrada.rango)}" no existe.`);
  let desde: string | undefined;
  let hasta: string | undefined;
  if (rango === 'personalizado') {
    desde = fechaEntrada.desde === undefined || fechaEntrada.desde === '' ? undefined : (validarValor(columnaFecha, fechaEntrada.desde, 'desde') as string);
    hasta = fechaEntrada.hasta === undefined || fechaEntrada.hasta === '' ? undefined : (validarValor(columnaFecha, fechaEntrada.hasta, 'hasta') as string);
    if (!desde && !hasta) error('Para un rango personalizado, elige al menos una fecha.');
    if (desde && hasta && desde > hasta) error('La fecha "desde" es posterior a la fecha "hasta".');
  }

  let sucursalId: string | undefined;
  if (f.sucursalId !== undefined && f.sucursalId !== null && f.sucursalId !== '') {
    if (typeof f.sucursalId !== 'string' || !UUID.test(f.sucursalId)) error('La sucursal del filtro no es válida.');
    sucursalId = f.sucursalId as string;
  }
  const soloMios = f.soloMios === true;
  if (soloMios && !tipo.creadoPor) error(`El reporte de ${tipo.nombre} no tiene "solo míos".`);

  const camposEntrada = Array.isArray(f.campos) ? f.campos : [];
  if (camposEntrada.length > MAX_FILTROS) error(`Un reporte puede tener hasta ${MAX_FILTROS} filtros.`);
  const campos: FiltroCampo[] = camposEntrada.map((entradaFiltro, i) => {
    if (!esObjeto(entradaFiltro)) error(`El filtro ${i + 1} no es válido.`);
    const x = entradaFiltro as Record<string, unknown>;
    const columna = columnaDe(tipo, x.columna, `filtro ${i + 1}`);
    const operador = x.operador as Operador;
    if (!OPERADORES[columna.tipo].includes(operador)) error(`El filtro "${String(x.operador)}" no sirve para "${columna.nombre}".`);
    const filtro: FiltroCampo = { columna: columna.clave, operador };
    if (operador === 'en' || operador === 'no_en') {
      const valores = Array.isArray(x.valores) ? x.valores : [];
      if (valores.length === 0) error(`Elige al menos un valor para el filtro de "${columna.nombre}".`);
      if (valores.length > MAX_VALORES_LISTA) error(`Demasiados valores en el filtro de "${columna.nombre}".`);
      for (const v of valores) {
        if (typeof v !== 'string' || !(columna.opciones && v in columna.opciones)) error(`"${String(v)}" no es un valor de "${columna.nombre}".`);
      }
      filtro.valores = [...new Set(valores as string[])];
    } else if (operador === 'entre') {
      filtro.valor = validarValor(columna, x.valor, 'desde');
      filtro.valorHasta = validarValor(columna, x.valorHasta, 'hasta');
    } else if (!['vacio', 'no_vacio', 'es_verdadero', 'es_falso'].includes(operador)) {
      filtro.valor = validarValor(columna, x.valor, 'valor');
      if ((operador === 'contiene' || operador === 'no_contiene' || operador === 'empieza') && String(filtro.valor).trim() === '') {
        error(`Escribe qué buscar en el filtro de "${columna.nombre}".`);
      }
    }
    return filtro;
  });

  // Orden: solo por columnas visibles o agrupadas.
  const visibles = new Set([...columnas, ...agrupaciones.map((a) => a.columna)]);
  const ordenEntrada = Array.isArray(d.orden) ? d.orden : [];
  const orden = ordenEntrada.slice(0, 5).map((o) => {
    if (!esObjeto(o)) error('El orden no es válido.');
    const x = o as Record<string, unknown>;
    const columna = columnaDe(tipo, x.columna, 'orden');
    if (!visibles.has(columna.clave)) error(`Para ordenar por "${columna.nombre}", agrégala como columna.`);
    const direccion = x.direccion === 'desc' ? 'desc' : 'asc';
    return { columna: columna.clave, direccion } as const;
  });

  return {
    version: VERSION_DEFINICION,
    tipo: tipo.clave,
    formato,
    columnas,
    agrupaciones,
    totales,
    mostrarDetalle: formato === 'LISTA' ? true : d.mostrarDetalle !== false,
    filtros: { fecha: { columna: columnaFecha.clave, rango, desde, hasta }, sucursalId, soloMios, campos },
    orden,
  };
}
