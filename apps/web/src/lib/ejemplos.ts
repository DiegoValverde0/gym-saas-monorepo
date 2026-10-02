import type { RangoFecha, Resultado, Resumen } from '@/app/dashboard/reporteria/tipos';
import type { Kpis } from '@/components/inicio/indicadores';

// Datos de ejemplo del Inicio (docs/plan-inicio.md, decisión I4): un gimnasio
// recién creado no ve todo en cero, sino cómo se va a ver, con cada tarjeta
// marcada "Ejemplo". Se arman sobre el resultado real (vacío) de cada
// tarjeta, que ya trae sus ejes; solo se inventan los números, con formas
// creíbles (más gente a la mañana y a la tarde, menos el fin de semana).

type Eje = Resultado['agrupaciones'][number];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const masDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Nombres para los ejes de texto (planes, sucursales, clases, personas).
const NOMBRES_TEXTO: Record<string, string[]> = {
  plan: ['Mensual', 'Trimestral', 'Anual', 'Pase diario'],
  sucursal: ['Central', 'Norte'],
  clase: ['Funcional', 'Spinning', 'Yoga', 'Box'],
  disciplina: ['Funcional', 'Spinning', 'Yoga', 'Box'],
  persona: ['Ana', 'Luis', 'Carla'],
};

/** Los valores de un eje: los últimos días o meses, los días de la semana, las horas… */
export function valoresDelEje(eje: Eje, rango: RangoFecha | undefined, hoy: Date): unknown[] {
  if (eje.granularidad === 'anio') return [2, 1, 0].map((n) => `${hoy.getFullYear() - n}-01-01`);
  if (eje.granularidad === 'mes') {
    const meses = rango === 'este_anio' ? hoy.getMonth() + 1 : 12;
    return Array.from({ length: meses }, (_, i) => iso(new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1 - i), 1)));
  }
  if (eje.granularidad === 'semana') return Array.from({ length: 12 }, (_, i) => iso(masDias(hoy, -7 * (11 - i) - ((hoy.getDay() + 6) % 7))));
  if (eje.granularidad === 'dia' || eje.tipo === 'fecha') {
    const dias = rango === 'ultimos_7' || rango === 'esta_semana' ? 7 : 30;
    return Array.from({ length: dias }, (_, i) => iso(masDias(hoy, -(dias - 1 - i))));
  }
  // En orden: el objeto pone primero las claves que parecen números ("10", "11"…).
  if (eje.opciones) return Object.keys(eje.opciones).sort();
  if (eje.clave === 'hora') return Array.from({ length: 17 }, (_, i) => i + 6);
  return NOMBRES_TEXTO[eje.clave] ?? ['Ejemplo A', 'Ejemplo B', 'Ejemplo C'];
}

// Cuánta gente viene a cada hora y cada día de la semana (1 = lunes).
const POR_HORA = (h: number) => 0.25 + 0.9 * Math.exp(-((h - 7) ** 2) / 3) + 1.1 * Math.exp(-((h - 19) ** 2) / 4) + 0.3 * Math.exp(-((h - 12) ** 2) / 2);
const POR_DIA_SEMANA: Record<string, number> = { '1': 1, '2': 0.97, '3': 1, '4': 0.92, '5': 0.85, '6': 0.6, '7': 0.35 };
// Por mes del año: más en enero (los propósitos de año nuevo), menos a mitad de año.
const POR_MES = [1.2, 1.1, 1.05, 1, 0.97, 0.9, 0.86, 0.92, 1, 1.02, 0.98, 0.88];

/** Cuánto pesa un valor del eje (1 = lo normal). */
function factor(eje: Eje, valor: unknown, i: number, n: number): number {
  if (eje.clave === 'hora') return POR_HORA(Number(valor));
  if (eje.clave === 'diaSemana') return POR_DIA_SEMANA[String(valor)] ?? 1;
  if (eje.clave === 'mesDelAnio') return POR_MES[Number(valor) - 1] ?? 1;
  if (eje.granularidad === 'anio') return 0.82 + 0.09 * i;
  if (eje.granularidad === 'mes') return (0.9 + (0.15 * i) / Math.max(1, n - 1)) * (POR_MES[new Date(`${String(valor)}T00:00:00`).getMonth()] ?? 1);
  if (eje.granularidad === 'dia' || eje.tipo === 'fecha') {
    const dia = String(((new Date(`${String(valor)}T00:00:00`).getDay() + 6) % 7) + 1);
    return POR_DIA_SEMANA[dia] ?? 1;
  }
  // Texto o lista: el primero es el que más tiene.
  return 1 / (1 + 0.7 * i);
}

/** Un poco de variación, siempre la misma (para que el ejemplo no cambie al recargar). */
const ruido = (i: number, j: number) => 1 + 0.08 * Math.sin(i * 12.9898 + j * 78.233);

/** Lo normal para una casilla, según lo que se mide y lo más fino de los ejes. */
function base(total: Resultado['totales'][number] | undefined, ejes: Eje[]): number {
  const porDia = (e: Eje) => e.granularidad === 'dia' || (e.tipo === 'fecha' && !e.granularidad);
  const fino = ejes.some((e) => e.clave === 'hora') ? 'hora' : ejes.some(porDia) ? 'dia' : ejes.some((e) => e.granularidad === 'mes' || e.clave === 'mesDelAnio') ? 'mes' : 'grupo';
  if (total?.funcion === 'promedio') return total.tipo === 'moneda' ? 250 : 62;
  if (total?.tipo === 'moneda') return { hora: 180, dia: 1100, mes: 32000, grupo: 14000 }[fino];
  return { hora: 22, dia: 110, mes: 24, grupo: 18 }[fino];
}

/** Los números redondos de una casilla: la cantidad y cada total. */
function casilla(r: Resultado, peso: number): { cantidad: number; totales: number[] } {
  const ejes = [...r.agrupaciones, ...(r.columnaCruzada ? [r.columnaCruzada] : [])];
  const totales = r.totales.map((t) => {
    const v = base(t, ejes) * peso;
    // Los porcentajes (la ocupación) no pasan de 100.
    return t.funcion === 'promedio' && t.tipo !== 'moneda' ? Math.min(100, Math.round(v)) : t.tipo === 'moneda' ? Math.round(v / 10) * 10 : Math.round(v);
  });
  return { cantidad: Math.max(1, Math.round(base(undefined, ejes) * peso)), totales };
}

const sumar = (a: { cantidad: number; totales: number[] }[], n: number) => ({
  cantidad: a.reduce((s, x) => s + x.cantidad, 0),
  totales: Array.from({ length: n }, (_, k) => a.reduce((s, x) => s + x.totales[k], 0)),
});

/**
 * El resultado de una tarjeta con números de ejemplo, o null si no se puede
 * armar (las listas no llevan ejemplos: serían personas inventadas).
 */
export function resultadoDeEjemplo(real: Resultado, hoy = new Date()): Resultado | null {
  const d = real.definicion;
  if (d.formato === 'LISTA' || real.agrupaciones.length === 0) return null;
  const rango = d.filtros.fecha.rango;
  const filas = real.agrupaciones[0];
  const valoresFilas = valoresDelEje(filas, rango, hoy);
  const resumenes: Resumen[] = [];

  if (d.formato === 'TABLA_CRUZADA' && real.columnaCruzada) {
    const col = real.columnaCruzada;
    const valoresCol = valoresDelEje(col, rango, hoy);
    // Comparando años mes a mes, el año actual llega hasta este mes.
    const existe = (fila: unknown, c: unknown) => !(filas.granularidad === 'anio' && col.clave === 'mesDelAnio' && String(fila).startsWith(String(hoy.getFullYear())) && Number(c) > hoy.getMonth() + 1);
    const porColumna = new Map<string, { cantidad: number; totales: number[] }[]>();
    const todas: { cantidad: number; totales: number[] }[] = [];
    valoresFilas.forEach((f, i) => {
      const deLaFila: { cantidad: number; totales: number[] }[] = [];
      valoresCol.forEach((c, j) => {
        if (!existe(f, c)) return;
        const x = casilla(real, factor(filas, f, i, valoresFilas.length) * factor(col, c, j, valoresCol.length) * ruido(i, j));
        resumenes.push({ nivel: 1, grupo: [f], columna: c, conColumna: true, ...x });
        deLaFila.push(x);
        porColumna.set(JSON.stringify(c), [...(porColumna.get(JSON.stringify(c)) ?? []), x]);
      });
      const fila = sumar(deLaFila, real.totales.length);
      resumenes.push({ nivel: 1, grupo: [f], ...fila });
      todas.push(fila);
    });
    valoresCol.forEach((c) => resumenes.push({ nivel: 0, grupo: [], columna: c, conColumna: true, ...sumar(porColumna.get(JSON.stringify(c)) ?? [], real.totales.length) }));
    const total = sumar(todas, real.totales.length);
    resumenes.push({ nivel: 0, grupo: [], ...total });
    return { ...real, filas: null, resumenes, totalFilas: total.cantidad };
  }

  const todas = valoresFilas.map((f, i) => {
    const x = casilla(real, factor(filas, f, i, valoresFilas.length) * ruido(i, 1));
    resumenes.push({ nivel: 1, grupo: [f], ...x });
    return x;
  });
  const total = sumar(todas, real.totales.length);
  resumenes.push({ nivel: 0, grupo: [], ...total });
  return { ...real, filas: null, resumenes, totalFilas: total.cantidad };
}

/** El estado de los clientes de ejemplo (la barra apilada del Inicio). */
export const ESTADO_CLIENTES_EJEMPLO = {
  total: 240,
  porSegmento: { ACTIVO_VIGENTE: 168, ACTIVO_ENCOLADO: 10, INACTIVO_VENCIDO_RECIENTE: 26, INACTIVO_CHURN: 22, PROSPECTO: 14 } as Record<string, number>,
};

/**
 * Los indicadores de ejemplo, con la misma forma que los de verdad. Respeta lo
 * que esta persona puede ver: sin ingresos reales (el instructor), tampoco
 * de ejemplo.
 */
export function kpisDeEjemplo(real: Kpis, ahora = new Date()): Kpis {
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const diaDelMes = hoy.getDate();
  const diasDelMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  // Qué parte del día ya pasó (de 6 a 22 h, cuando el gimnasio está abierto).
  const avanceDelDia = Math.min(1, Math.max(0, (ahora.getHours() + ahora.getMinutes() / 60 - 6) / 16));
  const venta = (d: Date, i: number) => Math.round((1100 * (POR_DIA_SEMANA[String(((d.getDay() + 6) % 7) + 1)] ?? 1) * ruido(i, 3)) / 10) * 10;
  const ultimos = (n: number, valor: (d: Date, i: number) => number) => Array.from({ length: n }, (_, i) => masDias(hoy, -(n - i))).map((d, i) => ({ fecha: iso(d), valor: valor(d, i) }));
  const delMes = Array.from({ length: diaDelMes - 1 }, (_, i) => venta(new Date(hoy.getFullYear(), hoy.getMonth(), i + 1), i)).reduce((a, b) => a + b, 0);
  const ventaHoy = Math.round((venta(hoy, 99) * avanceDelDia) / 10) * 10;
  const mes = delMes + ventaHoy;
  const mesPasadoMismaAltura = Math.round(mes / 1.12 / 10) * 10;
  const asistenciasHoy = Math.round(110 * (POR_DIA_SEMANA[String(((hoy.getDay() + 6) % 7) + 1)] ?? 1) * avanceDelDia);
  return {
    ...real,
    ingresos: real.ingresos && {
      hoy: ventaHoy,
      ayerMismaHora: Math.round((ventaHoy / 1.06) / 10) * 10,
      mes,
      mesPasadoMismaAltura,
      mesPasado: 31_500,
      variacionMes: mesPasadoMismaAltura ? Math.round(((mes - mesPasadoMismaAltura) / mesPasadoMismaAltura) * 1000) / 10 : null,
      variacionHoy: 6,
      proyeccionMes: diaDelMes >= 3 ? Math.round((mes / (diaDelMes - 1 + avanceDelDia)) * diasDelMes) : null,
      serie: ultimos(30, venta),
    },
    asistencias: { hoy: asistenciasHoy, promedioMismoDia: Math.round(asistenciasHoy * 0.93), serie: ultimos(14, (d, i) => Math.round(110 * (POR_DIA_SEMANA[String(((d.getDay() + 6) % 7) + 1)] ?? 1) * ruido(i, 5))) },
    clientes: { activos: 178, totales: 240, altasMes: 14, altasMesPasadoMismaAltura: 11 },
    membresiasPorVencer: 9,
  };
}
