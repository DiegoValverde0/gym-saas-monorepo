import { BadRequestException } from '@nestjs/common';
import { ColumnaCatalogo, TipoDato, TipoReporte } from '../catalogo';
import { analizarLogica, GrupoPersonalizado, MAX_CRUZADOS, tipoConGrupos, validarGruposPersonalizados } from './avanzado';

// Definición de un reporte (docs/plan-reporteria.md, sección 3.2): lo que se
// guarda en reportes.definicion y lo que manda el constructor. Se valida
// contra el catálogo en cada ejecución.

const VERSION_DEFINICION = 1;
const MAX_AGRUPACIONES = 3;
const MAX_FILTROS = 20;
const MAX_VALORES_LISTA = 50;
const MAX_COLUMNAS = 40;

// TABLA_CRUZADA, filtros con/sin, lógica de filtros y grupos personalizados:
// modo experto (decisión R2).
export const FORMATOS = ['LISTA', 'AGRUPADO', 'TABLA_CRUZADA'] as const;
const MAX_FILAS_TABLA_CRUZADA = 2;
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

// Gráfico del reporte (fase 7): sobre un reporte agrupado o una tabla cruzada.
// area y barrasH: agrupado. calor (mapa de calor): tabla cruzada. Plan del Inicio, fase 2.
const TIPOS_GRAFICO = ['barras', 'lineas', 'torta', 'area', 'barrasH', 'calor'] as const;
export type TipoGrafico = (typeof TIPOS_GRAFICO)[number];

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

interface Grafico {
  tipo: TipoGrafico;
  /** "cantidad" o un total del reporte, como "suma:monto". */
  valor: string;
  /**
   * Tabla cruzada en barras o líneas: la última fila (el año actual, por
   * ejemplo) en el color principal y las demás en gris, para comparar.
   */
  destacar?: boolean;
}

export interface FiltroCruzado {
  clave: string;
  modo: 'con' | 'sin';
  rango?: RangoFecha;
}

export interface Definicion {
  version: number;
  tipo: string;
  formato: Formato;
  columnas: string[];
  /** Agrupado: los niveles. Tabla cruzada: las filas (1 o 2). */
  agrupaciones: Agrupacion[];
  /** Tabla cruzada: lo que va en las columnas. */
  columnaCruzada?: Agrupacion;
  gruposPersonalizados: GrupoPersonalizado[];
  totales: Total[];
  /** Agrupado: mostrar también las filas de detalle bajo cada grupo. */
  mostrarDetalle: boolean;
  filtros: {
    fecha: { columna: string; rango: RangoFecha; desde?: string; hasta?: string };
    sucursalId?: string;
    soloMios: boolean;
    campos: FiltroCampo[];
    /** "1 Y (2 O 3)": cómo se combinan los filtros por columna (sin esto, todos a la vez). */
    logica?: string;
    cruzados: FiltroCruzado[];
  };
  orden: { columna: string; direccion: 'asc' | 'desc' }[];
  grafico?: Grafico;
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
 *
 * `avanzado`: si se aceptan las funciones de modo experto (tabla cruzada,
 * filtros con/sin, lógica y grupos personalizados). Al armar o guardar, solo
 * en modo experto; un reporte ya guardado se puede correr en cualquier modo.
 */
export function validarDefinicion(entrada: unknown, tipoBase: TipoReporte, opciones: { avanzado: boolean } = { avanzado: false }): Definicion {
  if (!esObjeto(entrada)) error('La definición del reporte no es válida.');
  const d = entrada as Record<string, unknown>;
  if (d.tipo !== tipoBase.clave) error('El tipo de la definición no coincide con el reporte.');

  const formato = (d.formato ?? 'LISTA') as Formato;
  if (!FORMATOS.includes(formato)) error(`El formato "${String(d.formato)}" no está disponible.`);

  // Grupos personalizados primero: son columnas más para todo lo demás.
  const gruposPersonalizados = validarGruposPersonalizados(d.gruposPersonalizados, tipoBase);
  const tipo = tipoConGrupos(tipoBase, gruposPersonalizados);
  const fEntrada = esObjeto(d.filtros) ? (d.filtros as Record<string, unknown>) : {};
  const logicaEntrada = typeof fEntrada.logica === 'string' && fEntrada.logica.trim() ? fEntrada.logica : undefined;
  const cruzadosEntrada = Array.isArray(fEntrada.cruzados) ? fEntrada.cruzados : [];
  if (!opciones.avanzado && (formato === 'TABLA_CRUZADA' || gruposPersonalizados.length || logicaEntrada || cruzadosEntrada.length)) {
    error('La tabla cruzada, los filtros "con / sin", la lógica de filtros y los grupos personalizados se usan en modo experto.');
  }

  // Columnas
  const columnasEntrada = Array.isArray(d.columnas) ? d.columnas : tipo.columnasIniciales;
  if (columnasEntrada.length > MAX_COLUMNAS) error(`Un reporte puede tener hasta ${MAX_COLUMNAS} columnas.`);
  const columnas = formato === 'TABLA_CRUZADA' ? [] : [...new Set(columnasEntrada.map((c) => columnaDe(tipo, c, 'columnas').clave))];
  if (formato === 'LISTA' && columnas.length === 0) error('Elige al menos una columna.');

  // Agrupaciones
  const agrupacionesEntrada = Array.isArray(d.agrupaciones) ? d.agrupaciones : [];
  if (formato === 'LISTA' && agrupacionesEntrada.length > 0) error('Para agrupar, elige el formato "Agrupado".');
  if (formato !== 'LISTA' && agrupacionesEntrada.length === 0) error('Elige por qué columna agrupar.');
  const maxNiveles = formato === 'TABLA_CRUZADA' ? MAX_FILAS_TABLA_CRUZADA : MAX_AGRUPACIONES;
  if (agrupacionesEntrada.length > maxNiveles) error(`Se puede agrupar por hasta ${maxNiveles} columnas.`);
  const agrupacion = (a: unknown, para: string): Agrupacion => {
    if (!esObjeto(a)) error('Una agrupación no es válida.');
    const g = a as Record<string, unknown>;
    const columna = columnaDe(tipo, g.columna, para);
    if (columna.agrupable === false) error(`No se puede agrupar por "${columna.nombre}".`);
    const esFecha = columna.tipo === 'fecha' || columna.tipo === 'fechaHora';
    if (esFecha) {
      const granularidad = (g.granularidad ?? 'dia') as Granularidad;
      if (!GRANULARIDADES.includes(granularidad)) error(`No se puede agrupar "${columna.nombre}" por "${String(g.granularidad)}".`);
      return { columna: columna.clave, granularidad };
    }
    if (g.granularidad !== undefined) error(`"${columna.nombre}" no es una fecha: no se agrupa por día, semana o mes.`);
    return { columna: columna.clave };
  };
  const agrupaciones = agrupacionesEntrada.map((a) => agrupacion(a, 'agrupar'));
  if (new Set(agrupaciones.map((a) => a.columna)).size !== agrupaciones.length) error('No se puede agrupar dos veces por la misma columna.');
  let columnaCruzada: Agrupacion | undefined;
  if (formato === 'TABLA_CRUZADA') {
    if (!d.columnaCruzada) error('Elige qué va en las columnas de la tabla.');
    columnaCruzada = agrupacion(d.columnaCruzada, 'columnas de la tabla');
    if (agrupaciones.some((a) => a.columna === columnaCruzada!.columna)) error('Las filas y las columnas de la tabla tienen que ser distintas.');
  } else if (d.columnaCruzada !== undefined && d.columnaCruzada !== null) {
    error('Las columnas de la tabla son solo para el formato "Tabla cruzada".');
  }

  // Totales (la cantidad de filas va siempre)
  const totalesEntrada = Array.isArray(d.totales) ? d.totales : [];
  if (totalesEntrada.length > MAX_COLUMNAS) error('Demasiados totales.');
  // En la tabla cruzada cada casilla muestra un solo número: la cantidad o un total.
  if (formato === 'TABLA_CRUZADA' && totalesEntrada.length > 1) error('En la tabla cruzada se elige un solo total para las casillas.');
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

  // Gráfico: solo con grupos. Si su total ya no está en el reporte, muestra
  // la cantidad (no se rompe un reporte guardado por quitar un total).
  let grafico: Grafico | undefined;
  if (esObjeto(d.grafico) && formato !== 'LISTA') {
    const g = d.grafico as Record<string, unknown>;
    const tipoGrafico = g.tipo as TipoGrafico;
    if (!TIPOS_GRAFICO.includes(tipoGrafico)) error(`El gráfico "${String(g.tipo)}" no existe.`);
    const graficable = totales.filter((t) => t.funcion === 'distintos' || ['numero', 'moneda'].includes(columnaDe(tipo, t.columna, 'gráfico').tipo));
    // En la tabla cruzada, el mismo número de las casillas.
    const pedido = formato === 'TABLA_CRUZADA' ? (totales[0] ? `${totales[0].funcion}:${totales[0].columna}` : 'cantidad') : g.valor;
    const total = graficable.find((t) => `${t.funcion}:${t.columna}` === pedido);
    if (formato === 'TABLA_CRUZADA' && totales[0] && !total) error('El gráfico necesita un número en las casillas: elige otro total.');
    // Una torta reparte un todo: cantidades o sumas, no promedios ni máximos.
    if (tipoGrafico === 'torta' && total && total.funcion !== 'suma') error('El gráfico de torta muestra cantidades o sumas.');
    if (tipoGrafico === 'calor' && formato !== 'TABLA_CRUZADA') error('El mapa de calor es para la tabla cruzada.');
    if ((tipoGrafico === 'area' || tipoGrafico === 'barrasH') && formato !== 'AGRUPADO') error('Ese gráfico es para un reporte agrupado.');
    const destacar = g.destacar === true && formato === 'TABLA_CRUZADA' && (tipoGrafico === 'barras' || tipoGrafico === 'lineas');
    grafico = { tipo: tipoGrafico, valor: total ? `${total.funcion}:${total.columna}` : 'cantidad', ...(destacar ? { destacar } : {}) };
  }

  // Filtros
  const f = fEntrada;
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

  // Lógica de filtros ("1 Y (2 O 3)") y filtros "con / sin".
  let logica: string | undefined;
  if (logicaEntrada) {
    if (campos.length === 0) error('La lógica de filtros necesita al menos un filtro por columna.');
    logica = analizarLogica(logicaEntrada, campos.length).normalizada;
  }
  if (cruzadosEntrada.length > MAX_CRUZADOS) error(`Se pueden usar hasta ${MAX_CRUZADOS} filtros "con / sin".`);
  const cruzados: FiltroCruzado[] = cruzadosEntrada.map((x, i) => {
    if (!esObjeto(x)) error(`El filtro "con / sin" ${i + 1} no es válido.`);
    const c = x as Record<string, unknown>;
    const def = tipoBase.cruzados?.find((y) => y.clave === c.clave);
    if (!def) error(`El reporte de ${tipoBase.nombre} no tiene el filtro "con / sin" "${String(c.clave)}".`);
    if (c.modo !== 'con' && c.modo !== 'sin') error(`Elige "con" o "sin" en el filtro de ${def!.nombre}.`);
    const filtro: FiltroCruzado = { clave: def!.clave, modo: c.modo as 'con' | 'sin' };
    if (def!.conRango && c.rango !== undefined && c.rango !== 'todo') {
      if (!RANGOS_FECHA.includes(c.rango as RangoFecha) || c.rango === 'personalizado') error(`El rango del filtro de ${def!.nombre} no es válido.`);
      filtro.rango = c.rango as RangoFecha;
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
    ...(columnaCruzada ? { columnaCruzada } : {}),
    gruposPersonalizados,
    totales,
    mostrarDetalle: formato === 'LISTA' ? true : formato === 'TABLA_CRUZADA' ? false : d.mostrarDetalle !== false,
    filtros: { fecha: { columna: columnaFecha.clave, rango, desde, hasta }, sucursalId, soloMios, campos, ...(logica ? { logica } : {}), cruzados },
    orden,
    ...(grafico ? { grafico } : {}),
  };
}
