import { aHoraLocal, desdeHoraLocal } from '../../common/utils/zona-horaria.util';

// Cálculos de los indicadores del Inicio (docs/plan-inicio.md, fase 1), sin
// base de datos: los rangos de fechas en la hora del gimnasio y las
// comparaciones. Todo "a la misma altura": hoy hasta esta hora contra ayer
// hasta la misma hora, y el mes hasta hoy contra los mismos días del mes pasado,
// para no comparar un día o un mes a medias contra uno completo.

const DIA_MS = 86_400_000;

export interface Rangos {
  ahora: Date;
  hoy: Date; // 00:00 local de hoy (instante)
  ayer: Date;
  ayerMismaHora: Date;
  mes: Date; // 00:00 local del día 1
  mesSiguiente: Date;
  mesPasado: Date;
  mesPasadoMismaAltura: Date;
  /** Fecha local de hoy (medianoche UTC, como @db.Date). */
  fechaHoy: Date;
  minutosDelDia: number;
}

const inicioDe = (fecha: Date, zona: string | null | undefined) => desdeHoraLocal(fecha, 0, zona);
const fecha = (anio: number, mes: number, dia: number) => new Date(Date.UTC(anio, mes, dia));
const diasDelMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();

export function rangos(ahora: Date, zona: string | null | undefined): Rangos {
  const { fechaSolo, minutosDelDia } = aHoraLocal(ahora, zona);
  const anio = fechaSolo.getUTCFullYear();
  const mes = fechaSolo.getUTCMonth();
  const dia = fechaSolo.getUTCDate();
  const fechaAyer = new Date(fechaSolo.getTime() - DIA_MS);
  // El mismo día del mes pasado, o su último día si es más corto (31 de marzo → 28 de febrero).
  const diaMesPasado = Math.min(dia, diasDelMes(anio, mes - 1));
  return {
    ahora,
    hoy: inicioDe(fechaSolo, zona),
    ayer: inicioDe(fechaAyer, zona),
    ayerMismaHora: desdeHoraLocal(fechaAyer, minutosDelDia, zona),
    mes: inicioDe(fecha(anio, mes, 1), zona),
    mesSiguiente: inicioDe(fecha(anio, mes + 1, 1), zona),
    mesPasado: inicioDe(fecha(anio, mes - 1, 1), zona),
    mesPasadoMismaAltura: desdeHoraLocal(fecha(anio, mes - 1, diaMesPasado), minutosDelDia, zona),
    fechaHoy: fechaSolo,
    minutosDelDia,
  };
}

/** Cambio porcentual (redondeado a un decimal); null si no hay con qué comparar. */
export function variacion(actual: number, anterior: number): number | null {
  if (!anterior) return null;
  return Math.round(((actual - anterior) / anterior) * 1000) / 10;
}

/**
 * Cuánto cerraría el mes al ritmo de lo que va: lo cobrado dividido por la
 * parte del mes que pasó. Con menos de 3 días no se proyecta (es puro ruido).
 */
export function proyeccionDelMes(montoMes: number, r: Rangos): number | null {
  const transcurrido = r.ahora.getTime() - r.mes.getTime();
  const total = r.mesSiguiente.getTime() - r.mes.getTime();
  if (transcurrido < 3 * DIA_MS || total <= 0) return null;
  return Math.round((montoMes / (transcurrido / total)) * 100) / 100;
}

/** Los últimos `dias` días locales, de más viejo a hoy, como 'AAAA-MM-DD'. */
export function ultimosDias(r: Rangos, dias: number): string[] {
  return Array.from({ length: dias }, (_, i) => new Date(r.fechaHoy.getTime() - (dias - 1 - i) * DIA_MS).toISOString().slice(0, 10));
}

/**
 * Asistencias "normales" para hoy a esta hora: el promedio de los mismos
 * días de la semana de las últimas `semanas` semanas, contando hasta la misma
 * hora del día. `hastaLaHora`: por día local, las que entraron antes de esa hora.
 */
export function promedioMismoDia(hastaLaHora: Map<string, number>, r: Rangos, semanas = 4): number | null {
  const conteos = Array.from({ length: semanas }, (_, i) => {
    const dia = new Date(r.fechaHoy.getTime() - (i + 1) * 7 * DIA_MS).toISOString().slice(0, 10);
    return hastaLaHora.get(dia) ?? 0;
  });
  if (conteos.every((c) => c === 0)) return null;
  return Math.round((conteos.reduce((a, b) => a + b, 0) / semanas) * 10) / 10;
}
