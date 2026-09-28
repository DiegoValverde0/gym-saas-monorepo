import { RangoFecha } from './definicion';

const DIA_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const mas = (d: Date, dias: number) => new Date(d.getTime() + dias * DIA_MS);
const inicioDeMes = (d: Date, meses = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses, 1));
const inicioDeAnio = (d: Date, anios = 0) => new Date(Date.UTC(d.getUTCFullYear() + anios, 0, 1));
// La semana empieza el lunes.
const inicioDeSemana = (d: Date) => mas(d, -((d.getUTCDay() + 6) % 7));

/**
 * Rango de fechas LOCALES del gimnasio: `desde` incluido, `hasta` excluido,
 * como "AAAA-MM-DD". `hoy` es la fecha local de hoy (medianoche UTC, como las
 * columnas @db.Date). Sin límite = undefined. Los rangos relativos se
 * calculan en cada ejecución: "este mes" de un reporte guardado es siempre
 * el mes en curso.
 */
export function rangoDeFechas(
  rango: RangoFecha,
  hoy: Date,
  personalizado: { desde?: string; hasta?: string } = {},
): { desde?: string; hasta?: string } {
  switch (rango) {
    case 'todo':
      return {};
    case 'hoy':
      return { desde: iso(hoy), hasta: iso(mas(hoy, 1)) };
    case 'ayer':
      return { desde: iso(mas(hoy, -1)), hasta: iso(hoy) };
    case 'esta_semana':
      return { desde: iso(inicioDeSemana(hoy)), hasta: iso(mas(inicioDeSemana(hoy), 7)) };
    case 'semana_pasada':
      return { desde: iso(mas(inicioDeSemana(hoy), -7)), hasta: iso(inicioDeSemana(hoy)) };
    case 'este_mes':
      return { desde: iso(inicioDeMes(hoy)), hasta: iso(inicioDeMes(hoy, 1)) };
    case 'mes_pasado':
      return { desde: iso(inicioDeMes(hoy, -1)), hasta: iso(inicioDeMes(hoy)) };
    case 'ultimos_7':
      return { desde: iso(mas(hoy, -6)), hasta: iso(mas(hoy, 1)) };
    case 'ultimos_30':
      return { desde: iso(mas(hoy, -29)), hasta: iso(mas(hoy, 1)) };
    case 'ultimos_90':
      return { desde: iso(mas(hoy, -89)), hasta: iso(mas(hoy, 1)) };
    case 'este_anio':
      return { desde: iso(inicioDeAnio(hoy)), hasta: iso(inicioDeAnio(hoy, 1)) };
    case 'anio_pasado':
      return { desde: iso(inicioDeAnio(hoy, -1)), hasta: iso(inicioDeAnio(hoy)) };
    case 'proximos_7':
      return { desde: iso(hoy), hasta: iso(mas(hoy, 7)) };
    case 'proximos_30':
      return { desde: iso(hoy), hasta: iso(mas(hoy, 30)) };
    case 'personalizado':
      return {
        desde: personalizado.desde,
        hasta: personalizado.hasta ? iso(mas(new Date(`${personalizado.hasta}T00:00:00Z`), 1)) : undefined,
      };
  }
}

/** El día siguiente de una fecha "AAAA-MM-DD" (para "igual a" y "hasta" inclusivos). */
export const diaSiguiente = (fecha: string) => iso(mas(new Date(`${fecha}T00:00:00Z`), 1));
