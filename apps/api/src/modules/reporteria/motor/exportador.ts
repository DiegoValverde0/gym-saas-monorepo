import * as ExcelJS from 'exceljs';
import { Granularidad, RangoFecha } from './definicion';

// Exportación de reportes (docs/plan-reporteria.md, fase 5): CSV y Excel a
// partir del resultado ya calculado (mismos números que en pantalla).

export interface ColumnaExportable {
  clave: string;
  nombre: string;
  tipo: string;
  opciones?: Record<string, string>;
  granularidad?: Granularidad;
}

export interface DatosExportacion {
  titulo: string;
  tipoNombre: string;
  /** "Últimos 90 días · Titan Central" */
  filtros: string;
  zonaHoraria: string;
  generado: Date;
  grupos: ColumnaExportable[];
  /** Tabla cruzada: lo que va en las columnas. */
  cruzada?: ColumnaExportable;
  columnas: ColumnaExportable[];
  totales: { nombre: string; tipo: string }[];
  /** Detalle: g0, g1... y las columnas por su clave. null = solo subtotales. */
  filas: Record<string, unknown>[] | null;
  resumenes: { nivel: number; grupo: unknown[]; cantidad: number; totales: (number | string | null)[]; columna?: unknown; conColumna?: boolean }[];
}

/**
 * Tabla cruzada como matriz: una fila por grupo (con subtotales si hay dos
 * niveles), una columna por cada valor de la columna cruzada, "Total" a la
 * derecha y abajo. En cada casilla, el total elegido o la cantidad.
 */
export function matrizCruzada(d: DatosExportacion): { titulos: string[]; filas: (string | number | null)[][]; subtotal: boolean[] } {
  const c = d.cruzada!;
  const niveles = d.grupos.length;
  const valor = (r: { cantidad: number; totales: (number | string | null)[] }) =>
    d.totales.length ? (r.totales[0] === null ? null : Number(r.totales[0])) : r.cantidad;
  const clave = (v: unknown) => JSON.stringify(v ?? null);
  const columnas: unknown[] = [];
  for (const r of d.resumenes) if (r.conColumna && !columnas.some((x) => clave(x) === clave(r.columna))) columnas.push(r.columna);
  const titulos = [...d.grupos.map((g) => g.nombre), ...columnas.map((v) => textoValor(v, c, d.zonaHoraria) || '(sin dato)'), 'Total'];
  const filas: (string | number | null)[][] = [];
  const subtotal: boolean[] = [];
  const mismaFila = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => clave(v) === clave(b[i]));
  // Filas en el orden de la consulta: cada grupo y, debajo, sus subgrupos.
  const filasGrupo = d.resumenes.filter((r) => !r.conColumna && r.nivel > 0);
  const totalGeneral = d.resumenes.find((r) => !r.conColumna && r.nivel === 0);
  for (const r of [...filasGrupo, ...(totalGeneral ? [totalGeneral] : [])]) {
    const etiquetas = d.grupos.map((g, i) =>
      r.nivel === 0 && i === 0 ? 'Total' : i < r.nivel ? textoValor(r.grupo[i], g, d.zonaHoraria) || '(sin dato)' : r.nivel < niveles && i === r.nivel ? 'Subtotal' : '',
    );
    const casillas = columnas.map((v) => {
      const celda = d.resumenes.find((x) => x.conColumna && x.nivel === r.nivel && mismaFila(x.grupo, r.grupo) && clave(x.columna) === clave(v));
      return celda ? valor(celda) : null;
    });
    filas.push([...etiquetas, ...casillas, valor(r)]);
    subtotal.push(r.nivel < niveles);
  }
  return { titulos, filas, subtotal };
}

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
  personalizado: 'Fechas elegidas',
};

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const ddmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

// Crear un Intl.DateTimeFormat es caro: uno por zona, no uno por celda
// (con 50.000 filas era la mayor parte del tiempo de exportar).
const formatos = new Map<string, Intl.DateTimeFormat>();
const formatoDe = (zonaHoraria: string) => {
  let f = formatos.get(zonaHoraria);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    formatos.set(zonaHoraria, f);
  }
  return f;
};

/** Hora "de reloj" del gimnasio de un instante, como fecha UTC (así Excel la muestra tal cual). */
function relojLocal(instante: Date, zonaHoraria: string): Date {
  const p = Object.fromEntries(
    formatoDe(zonaHoraria)
      .formatToParts(instante)
      .map((x) => [x.type, x.value]),
  );
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)));
}

const vacio = (v: unknown) => v === null || v === undefined || v === '';

/** Texto de un valor, igual que en pantalla (para CSV y celdas de texto). */
export function textoValor(v: unknown, c: Pick<ColumnaExportable, 'tipo' | 'opciones' | 'granularidad'>, zonaHoraria: string): string {
  if (vacio(v)) return '';
  if (c.granularidad && typeof v === 'string') {
    const [a, m] = v.split('-');
    if (c.granularidad === 'anio') return a;
    if (c.granularidad === 'mes') return `${MESES[Number(m) - 1]} ${a}`;
    if (c.granularidad === 'semana') return `Semana del ${ddmmaaaa(v)}`;
    return ddmmaaaa(v);
  }
  switch (c.tipo) {
    case 'moneda':
      return Number(v).toFixed(2).replace('.', ',');
    case 'numero':
      return String(v).replace('.', ',');
    case 'fecha':
      return ddmmaaaa(String(v));
    case 'fechaHora': {
      const d = relojLocal(new Date(String(v)), zonaHoraria).toISOString();
      return `${ddmmaaaa(d)} ${d.slice(11, 16)}`;
    }
    case 'booleano':
      return v ? 'Sí' : 'No';
    case 'lista':
      return c.opciones?.[String(v)] ?? String(v);
    default:
      return String(v);
  }
}

// Formato de Excel de cada tipo de dato (el mismo que pone `celda`).
const FORMATO_COLUMNA: Record<string, string | undefined> = { moneda: '#,##0.00', numero: '#,##0.##', fecha: 'dd/mm/yyyy', fechaHora: 'dd/mm/yyyy hh:mm' };

/** Valor tipado para una celda de Excel, con su formato. */
function celda(v: unknown, c: Pick<ColumnaExportable, 'tipo' | 'opciones' | 'granularidad'>, zonaHoraria: string): { valor: ExcelJS.CellValue; formato?: string } {
  if (vacio(v)) return { valor: null };
  if (c.granularidad) return { valor: textoValor(v, c, zonaHoraria) };
  switch (c.tipo) {
    case 'moneda':
      return { valor: Number(v), formato: '#,##0.00' };
    case 'numero':
      return { valor: Number(v), formato: '#,##0.##' };
    case 'fecha': {
      const [a, m, d] = String(v).slice(0, 10).split('-').map(Number);
      return { valor: new Date(Date.UTC(a, m - 1, d)), formato: 'dd/mm/yyyy' };
    }
    case 'fechaHora':
      return { valor: relojLocal(new Date(String(v)), zonaHoraria), formato: 'dd/mm/yyyy hh:mm' };
    default:
      return { valor: textoValor(v, c, zonaHoraria) };
  }
}

// ---- CSV

const campoCsv = (texto: string) => (/[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto);

/**
 * CSV para Excel en español: separado por ";", con BOM para que reconozca los
 * acentos, y comas decimales. Con detalle, una fila por registro (con sus
 * grupos al principio); sin detalle, los subtotales.
 */
export function aCsv(d: DatosExportacion): Buffer {
  const lineas: string[][] = [];
  if (d.cruzada) {
    const m = matrizCruzada(d);
    const moneda = d.totales[0]?.tipo === 'moneda';
    lineas.push(m.titulos);
    for (const f of m.filas) {
      lineas.push(f.map((x) => (typeof x === 'number' ? (moneda ? x.toFixed(2) : String(x)).replace('.', ',') : x ?? '')));
    }
  } else if (d.filas) {
    lineas.push([...d.grupos, ...d.columnas].map((c) => c.nombre));
    for (const f of d.filas) {
      lineas.push([
        ...d.grupos.map((g, i) => textoValor(f[`g${i}`], g, d.zonaHoraria)),
        ...d.columnas.map((c) => textoValor(f[c.clave], c, d.zonaHoraria)),
      ]);
    }
  } else {
    lineas.push([...d.grupos.map((g) => g.nombre), 'Registros', ...d.totales.map((t) => t.nombre)]);
    const primerTotal = d.grupos.length + 1;
    for (const r of filasResumen(d)) {
      lineas.push(
        r.map((x, i) => {
          if (typeof x !== 'number') return x ?? '';
          // Montos con dos decimales, igual que en el detalle.
          return i >= primerTotal && d.totales[i - primerTotal].tipo === 'moneda' ? x.toFixed(2).replace('.', ',') : String(x).replace('.', ',');
        }),
      );
    }
  }
  const texto = lineas.map((l) => l.map(campoCsv).join(';')).join('\r\n');
  // BOM al principio: así Excel reconoce los acentos.
  return Buffer.from(`${String.fromCharCode(0xfeff)}${texto}\r\n`, 'utf-8');
}

// Filas de la hoja "Resumen": cada subtotal con sus grupos, y el total general al final.
function filasResumen(d: DatosExportacion): (string | number | null)[][] {
  const niveles = d.grupos.length;
  const orden = [...d.resumenes.filter((r) => r.nivel > 0), ...d.resumenes.filter((r) => r.nivel === 0)];
  return orden.map((r) => [
    ...d.grupos.map((g, i) => (r.nivel === 0 && i === 0 ? 'Total general' : i < r.nivel ? textoValor(r.grupo[i], g, d.zonaHoraria) || '(sin dato)' : r.nivel < niveles && i === r.nivel ? 'Subtotal' : '')),
    r.cantidad,
    ...r.totales.map((t, i) => (t === null ? null : d.totales[i].tipo === 'moneda' || d.totales[i].tipo === 'numero' ? Number(t) : textoValor(t, d.totales[i], d.zonaHoraria))),
  ]);
}

// ---- Excel

const AZUL = 'FF4F46E5';
const GRIS = 'FFF1F5F9';

function encabezado(hoja: ExcelJS.Worksheet, d: DatosExportacion, titulo: string) {
  hoja.addRow([titulo]).font = { bold: true, size: 14 };
  const fecha = relojLocal(d.generado, d.zonaHoraria).toISOString();
  hoja.addRow([`${d.tipoNombre} · ${d.filtros} · Generado el ${ddmmaaaa(fecha)} a las ${fecha.slice(11, 16)}`]).font = { color: { argb: 'FF64748B' } };
  hoja.addRow([]);
}

function filaTitulos(hoja: ExcelJS.Worksheet, titulos: string[]) {
  const fila = hoja.addRow(titulos);
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  fila.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }));
  hoja.views = [{ state: 'frozen', ySplit: fila.number }];
  hoja.autoFilter = { from: { row: fila.number, column: 1 }, to: { row: fila.number, column: titulos.length } };
  return fila.number;
}

// Para el ancho de cada columna alcanza con mirar las primeras filas.
const FILAS_PARA_ANCHO = 1000;

function anchos(hoja: ExcelJS.Worksheet, desdeFila: number) {
  const hasta = Math.min(hoja.rowCount, desdeFila + FILAS_PARA_ANCHO);
  hoja.columns.forEach((col, j) => {
    let maximo = 10;
    for (let n = desdeFila; n <= hasta; n++) {
      const valor = hoja.getRow(n).getCell(j + 1).value;
      if (valor === null || valor === undefined) continue;
      const largo = valor instanceof Date ? 16 : String(valor).length;
      maximo = Math.max(maximo, Math.min(largo + 2, 50));
    }
    col.width = maximo;
  });
}

/** Excel con la hoja "Datos" (si hay detalle) y la hoja "Resumen" (subtotales y total general). */
export async function aExcel(d: DatosExportacion): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Gym Manager';
  libro.created = d.generado;

  if (d.cruzada) {
    // Tabla cruzada: una sola hoja con la matriz.
    const hoja = libro.addWorksheet('Tabla');
    encabezado(hoja, d, d.titulo);
    const m = matrizCruzada(d);
    const primera = filaTitulos(hoja, m.titulos);
    m.filas.forEach((valores, i) => {
      const fila = hoja.addRow(valores);
      if (d.totales[0]?.tipo === 'moneda') {
        for (let j = d.grupos.length + 1; j <= valores.length; j++) fila.getCell(j).numFmt = '#,##0.00';
      }
      if (m.subtotal[i]) {
        fila.font = { bold: true };
        fila.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } }));
      }
    });
    anchos(hoja, primera);
    return Buffer.from(await libro.xlsx.writeBuffer());
  }

  if (d.filas) {
    const hoja = libro.addWorksheet('Datos');
    encabezado(hoja, d, d.titulo);
    const cols = [...d.grupos.map((g, i) => ({ ...g, clave: `g${i}` })), ...d.columnas];
    const primera = filaTitulos(hoja, cols.map((c) => c.nombre));
    // El formato (moneda, fecha...) depende solo de la columna: se pone una
    // vez por columna y no en cada celda (mucho más rápido con 50.000 filas).
    // Las filas que se agregan después lo toman de su columna.
    cols.forEach((c, i) => {
      const formato = FORMATO_COLUMNA[c.granularidad ? 'texto' : c.tipo];
      if (formato) hoja.getColumn(i + 1).numFmt = formato;
    });
    for (const f of d.filas) hoja.addRow(cols.map((c) => celda(f[c.clave], c, d.zonaHoraria).valor));
    anchos(hoja, primera);
  }

  const resumen = libro.addWorksheet('Resumen');
  encabezado(resumen, d, `${d.titulo} (resumen)`);
  const titulos = [...d.grupos.map((g) => g.nombre), 'Registros', ...d.totales.map((t) => t.nombre)];
  const primera = filaTitulos(resumen, titulos.length ? titulos : ['Registros']);
  const niveles = d.grupos.length;
  const orden = [...d.resumenes.filter((r) => r.nivel > 0), ...d.resumenes.filter((r) => r.nivel === 0)];
  filasResumen(d).forEach((valores, i) => {
    const fila = resumen.addRow(valores);
    const nivel = orden[i].nivel;
    d.totales.forEach((t, j) => {
      if (t.tipo === 'moneda') fila.getCell(niveles + 2 + j).numFmt = '#,##0.00';
    });
    if (nivel < niveles) {
      fila.font = { bold: true };
      fila.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } }));
    }
  });
  anchos(resumen, primera);

  return Buffer.from(await libro.xlsx.writeBuffer());
}

/** Nombre de archivo seguro con la fecha del gimnasio: "ventas-por-plan-2026-10-01.xlsx". */
export function nombreArchivo(titulo: string, generado: Date, extension: 'csv' | 'xlsx', zonaHoraria: string) {
  const base =
    titulo
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'reporte';
  return `${base}-${relojLocal(generado, zonaHoraria).toISOString().slice(0, 10)}.${extension}`;
}
