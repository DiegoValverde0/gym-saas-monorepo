// "Lo que hay que saber hoy" en el Inicio (docs/plan-inicio.md, sección 4 y
// fase 4): frases que salen de reglas claras sobre los datos (decisión I3), no
// de adivinar. Aquí, lo que no toca la base: el texto de cada frase, cuándo se
// dice y cuáles se muestran. Las consultas están en dashboard.service.ts.

export type Tono = 'bueno' | 'atencion' | 'info';

export interface Frase {
  clave: string;
  /** Para ordenar: lo urgente primero. */
  importancia: number;
  tono: Tono;
  texto: string;
  detalle?: string;
  accion?: { texto: string; href: string };
}

/** Se muestran hasta 4, de la más a la menos importante. */
export const MAX_FRASES = 4;

export function elegirFrases(frases: (Frase | null)[], max = MAX_FRASES): Frase[] {
  return frases.filter((f): f is Frase => !!f).sort((a, b) => b.importancia - a.importancia).slice(0, max);
}

export const bs = (n: number) => `Bs. ${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const numero = (n: number) => n.toLocaleString('es-ES');
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

export const DIAS_SEMANA: Record<string, string> = { '1': 'lunes', '2': 'martes', '3': 'miércoles', '4': 'jueves', '5': 'viernes', '6': 'sábado', '7': 'domingo' };

/** Ingresos del mes contra los mismos días del mes pasado: se dice desde ±10 % (y desde el día 3). */
export function fraseRitmo({ mes, mesPasado, diaDelMes, href }: { mes: number; mesPasado: number; diaDelMes: number; href: string }): Frase | null {
  if (diaDelMes < 3 || mesPasado <= 0) return null;
  const v = Math.round(((mes - mesPasado) / mesPasado) * 100);
  if (Math.abs(v) < 10) return null;
  const arriba = v > 0;
  return {
    clave: 'ritmo-mes',
    importancia: arriba ? 60 : 70,
    tono: arriba ? 'bueno' : 'atencion',
    texto: `Vas ${Math.abs(v)} % ${arriba ? 'arriba' : 'abajo'} del mes pasado a esta altura.`,
    detalle: `${bs(mes)} este mes contra ${bs(mesPasado)} en los mismos días del mes pasado.`,
    accion: { texto: 'Ver ingresos', href },
  };
}

/** Clientes con membresía activa que no vienen hace 30 días (la plantilla "Clientes que no vienen hace 30 días"). */
export function fraseSinVenir(n: number, href: string): Frase | null {
  if (n <= 0) return null;
  return {
    clave: 'sin-venir',
    importancia: 80,
    tono: 'atencion',
    texto: `${numero(n)} ${plural(n, 'cliente con membresía activa no viene', 'clientes con membresía activa no vienen')} hace 30 días o más.`,
    detalle: 'Un mensaje a tiempo ayuda a que no abandonen.',
    accion: { texto: 'Ver quiénes', href },
  };
}

/** Membresías que vencen en los próximos 3 días y no se renovaron. */
export function frasePorVencer(n: number, href: string): Frase | null {
  if (n <= 0) return null;
  return {
    clave: 'por-vencer',
    importancia: 75,
    tono: 'atencion',
    texto: `${numero(n)} ${plural(n, 'membresía vence', 'membresías vencen')} en los próximos 3 días.`,
    detalle: 'Avísales para que renueven antes de que se les corte.',
    accion: { texto: 'Avisar', href },
  };
}

/**
 * La hora con más ingresos de los últimos 30 días (de la plantilla "¿A qué
 * hora viene la gente?"). Con pocos ingresos no se dice: no sería cierto.
 */
export function fraseHoraPico(
  pico: { dia: string; hora: number; cantidad: number; semanas: number } | null,
  totalIngresos: number,
  href: string,
): Frase | null {
  if (!pico || totalIngresos < 50 || pico.cantidad < 5) return null;
  const porSemana = Math.round(pico.cantidad / Math.max(1, pico.semanas));
  return {
    clave: 'hora-pico',
    importancia: 30,
    tono: 'info',
    texto: `Tu hora más llena: los ${DIAS_SEMANA[pico.dia] ?? pico.dia} a las ${pico.hora} h.`,
    detalle: `En los últimos 30 días entraron ${numero(pico.cantidad)} personas a esa hora (unas ${numero(porSemana)} por semana).`,
    accion: { texto: 'Ver el mapa', href },
  };
}

/** De las casillas del mapa de calor (día de la semana × hora), la más llena. */
export function horaMasLlena(casillas: { dia: string; hora: number; cantidad: number }[]): { dia: string; hora: number; cantidad: number } | null {
  let mejor: { dia: string; hora: number; cantidad: number } | null = null;
  for (const c of casillas) {
    // Ante un empate, la más temprana de la semana (para que la frase no cambie al azar).
    if (!mejor || c.cantidad > mejor.cantidad || (c.cantidad === mejor.cantidad && (c.dia < mejor.dia || (c.dia === mejor.dia && c.hora < mejor.hora)))) mejor = c;
  }
  return mejor;
}

/** Cuántas veces cae cada día de la semana ('1' lunes … '7' domingo) entre dos fechas "AAAA-MM-DD" (la segunda sin incluir). */
export function vecesPorDiaDeSemana(desde: string, hasta: string): Record<string, number> {
  const veces: Record<string, number> = {};
  for (let d = new Date(`${desde}T00:00:00Z`); d < new Date(`${hasta}T00:00:00Z`); d = new Date(d.getTime() + 86_400_000)) {
    const dia = String(((d.getUTCDay() + 6) % 7) + 1);
    veces[dia] = (veces[dia] ?? 0) + 1;
  }
  return veces;
}

const DIAS_CORTOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "hoy", "ayer" o "el lunes", de una fecha "AAAA-MM-DD" contra hoy. */
export function cuando(fecha: string, hoy: string): string {
  const dias = Math.round((new Date(`${hoy}T00:00:00Z`).getTime() - new Date(`${fecha}T00:00:00Z`).getTime()) / 86_400_000);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `el ${DIAS_CORTOS[new Date(`${fecha}T00:00:00Z`).getUTCDay()]}`;
}

/** "de hoy", "de mañana" o "del lunes", para una clase que viene. */
export function diaDeClase(fecha: string, hoy: string): string {
  const dias = Math.round((new Date(`${fecha}T00:00:00Z`).getTime() - new Date(`${hoy}T00:00:00Z`).getTime()) / 86_400_000);
  if (dias === 0) return 'de hoy';
  if (dias === 1) return 'de mañana';
  return `del ${DIAS_CORTOS[new Date(`${fecha}T00:00:00Z`).getUTCDay()]}`;
}

/** El último cierre de caja (de ayer o de hoy) con faltante o sobrante. */
export function fraseCaja(cierre: { caja: string; fecha: string; diferencia: number } | null, hoy: string, href: string): Frase | null {
  if (!cierre || Math.abs(cierre.diferencia) < 0.01) return null;
  const faltante = cierre.diferencia < 0;
  return {
    clave: 'caja',
    importancia: faltante ? 90 : 40,
    tono: faltante ? 'atencion' : 'info',
    texto: `La caja "${cierre.caja}" cerró ${cuando(cierre.fecha, hoy)} con un ${faltante ? 'faltante' : 'sobrante'} de ${bs(Math.abs(cierre.diferencia))}.`,
    accion: { texto: 'Ver los cierres', href },
  };
}

/** Productos con el stock en su punto de reorden o menos. */
export function fraseStock(n: number, href: string): Frase | null {
  if (n <= 0) return null;
  return {
    clave: 'stock',
    importancia: 65,
    tono: 'atencion',
    texto: `${numero(n)} ${plural(n, 'producto está', 'productos están')} por acabarse.`,
    detalle: 'Llegaron a su punto de reorden: hay que reponer.',
    accion: { texto: 'Ver cuáles', href },
  };
}

export interface ClaseProxima {
  nombre: string;
  /** "AAAA-MM-DD" y "HH:MM", en la hora del gimnasio. */
  fecha: string;
  hora: string;
  ocupados: number;
  capacidad: number;
}

/**
 * La próxima clase llena (90 % o más) o, si no hay, la más vacía de las de
 * hoy y mañana (30 % o menos, con lugar para 5 o más).
 */
export function fraseClase(clases: ClaseProxima[], hoy: string, href: string): Frase | null {
  const ocupacion = (c: ClaseProxima) => c.ocupados / c.capacidad;
  const conCapacidad = clases.filter((c) => c.capacidad > 0);
  const llena = conCapacidad.find((c) => ocupacion(c) >= 0.9);
  if (llena) {
    return {
      clave: 'clase-llena',
      importancia: 55,
      tono: 'bueno',
      texto: `${llena.nombre} ${diaDeClase(llena.fecha, hoy)} a las ${llena.hora} está ${llena.ocupados >= llena.capacidad ? 'llena' : 'casi llena'} (${llena.ocupados} de ${llena.capacidad}).`,
      detalle: llena.ocupados >= llena.capacidad ? 'Si se repite, piensa en abrir otro horario.' : undefined,
      accion: { texto: 'Ver la agenda', href },
    };
  }
  const manana = new Date(new Date(`${hoy}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  const vacia = conCapacidad
    .filter((c) => (c.fecha === hoy || c.fecha === manana) && c.capacidad >= 5 && ocupacion(c) <= 0.3)
    .sort((a, b) => ocupacion(a) - ocupacion(b))[0];
  if (!vacia) return null;
  return {
    clave: 'clase-vacia',
    importancia: 50,
    tono: 'info',
    texto: `${vacia.nombre} ${diaDeClase(vacia.fecha, hoy)} a las ${vacia.hora} tiene ${vacia.ocupados === 0 ? 'ninguna reserva' : `${vacia.ocupados} de ${vacia.capacidad} lugares ocupados`}.`,
    detalle: 'Un recordatorio a tus clientes puede llenarla.',
    accion: { texto: 'Ver la agenda', href },
  };
}
