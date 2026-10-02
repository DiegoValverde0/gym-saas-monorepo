import { describe, expect, it } from 'vitest';
import { promedioMismoDia, proyeccionDelMes, rangos, ultimosDias, variacion } from './indicadores';

const LA_PAZ = 'America/La_Paz'; // UTC-4, sin cambio de horario

describe('indicadores del Inicio', () => {
  it('hoy y ayer a la misma hora, en la hora del gimnasio', () => {
    // 2 oct 2026, 21:30 en La Paz = 3 oct 01:30 UTC: para el gimnasio sigue siendo el 2.
    const r = rangos(new Date('2026-10-03T01:30:00Z'), LA_PAZ);
    expect(r.fechaHoy.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    expect(r.hoy.toISOString()).toBe('2026-10-02T04:00:00.000Z');
    expect(r.ayer.toISOString()).toBe('2026-10-01T04:00:00.000Z');
    expect(r.ayerMismaHora.toISOString()).toBe('2026-10-02T01:30:00.000Z');
    expect(r.mes.toISOString()).toBe('2026-10-01T04:00:00.000Z');
    expect(r.mesSiguiente.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(r.mesPasado.toISOString()).toBe('2026-09-01T04:00:00.000Z');
    expect(r.mesPasadoMismaAltura.toISOString()).toBe('2026-09-03T01:30:00.000Z');
  });

  it('el 31 se compara con el último día de un mes más corto', () => {
    const r = rangos(new Date('2026-03-31T15:00:00Z'), LA_PAZ); // 31 mar, 11:00
    expect(r.mesPasadoMismaAltura.toISOString()).toBe('2026-02-28T15:00:00.000Z');
    // En enero, el mes pasado es diciembre del año anterior.
    expect(rangos(new Date('2026-01-10T15:00:00Z'), LA_PAZ).mesPasado.toISOString()).toBe('2025-12-01T04:00:00.000Z');
  });

  it('variación: porcentaje con un decimal, sin dividir por cero', () => {
    expect(variacion(118, 100)).toBe(18);
    expect(variacion(50, 200)).toBe(-75);
    expect(variacion(10, 3)).toBe(233.3);
    expect(variacion(100, 0)).toBeNull();
  });

  it('proyección: al ritmo de lo que va del mes, desde el tercer día', () => {
    // 2 oct: muy pronto para proyectar.
    expect(proyeccionDelMes(1000, rangos(new Date('2026-10-02T16:00:00Z'), LA_PAZ))).toBeNull();
    // 16 oct a las 00:00 local: pasaron 15 de 31 días.
    const r = rangos(new Date('2026-10-16T04:00:00Z'), LA_PAZ);
    expect(proyeccionDelMes(15000, r)).toBe(31000);
  });

  it('los últimos días, en la fecha del gimnasio', () => {
    const r = rangos(new Date('2026-10-02T16:00:00Z'), LA_PAZ);
    expect(ultimosDias(r, 3)).toEqual(['2026-09-30', '2026-10-01', '2026-10-02']);
  });

  it('asistencias normales: el promedio de los mismos días de la semana, hasta la misma hora', () => {
    const r = rangos(new Date('2026-10-02T16:00:00Z'), LA_PAZ); // viernes 2 oct, 12:00
    // Por día, las que entraron antes de las 12:00 (las cuenta la base).
    const hastaLaHora = new Map([
      ['2026-09-25', 2], // viernes pasado
      ['2026-09-18', 1], // hace dos viernes
      ['2026-09-24', 9], // jueves: no cuenta
    ]);
    expect(promedioMismoDia(hastaLaHora, r)).toBe(0.8); // (2 + 1 + 0 + 0) / 4
    expect(promedioMismoDia(new Map(), r)).toBeNull();
  });
});
