import { describe, expect, it } from 'vitest';
import { aHoraLocal, desdeHoraLocal, hoyEnOrganizacion, inicioDelDiaLocal } from './zona-horaria.util';

const LA_PAZ = 'America/La_Paz'; // UTC-4, sin horario de verano

describe('zona horaria de la organización', () => {
  it('a las 01:56 UTC del 28 en La Paz todavía es el 27 a las 21:56', () => {
    const { fechaSolo, minutosDelDia } = aHoraLocal(new Date('2026-09-28T01:56:00Z'), LA_PAZ);
    expect(fechaSolo.toISOString()).toBe('2026-09-27T00:00:00.000Z');
    expect(minutosDelDia).toBe(21 * 60 + 56);
  });

  it('convierte una hora local a UTC y de vuelta', () => {
    const instante = desdeHoraLocal(new Date('2026-09-27T00:00:00Z'), 18 * 60, LA_PAZ);
    expect(instante.toISOString()).toBe('2026-09-27T22:00:00.000Z');
    const vuelta = aHoraLocal(instante, LA_PAZ);
    expect(vuelta.minutosDelDia).toBe(18 * 60);
  });

  it('el día local empieza a las 04:00 UTC en La Paz', () => {
    expect(inicioDelDiaLocal(new Date('2026-09-28T01:56:00Z'), LA_PAZ).toISOString()).toBe('2026-09-27T04:00:00.000Z');
  });

  it('una zona horaria inválida usa la de La Paz en vez de fallar', () => {
    expect(aHoraLocal(new Date('2026-09-28T01:56:00Z'), 'Zona/Inexistente').fechaSolo.toISOString()).toBe('2026-09-27T00:00:00.000Z');
  });

  it('hoyEnOrganizacion usa la zona de la organización, no la del servidor', async () => {
    const db = { organizacion: { findUnique: async () => ({ zonaHoraria: LA_PAZ }) } };
    const hoy = await hoyEnOrganizacion(db, 'org-1', new Date('2026-09-28T01:56:00Z'));
    expect(hoy.toISOString()).toBe('2026-09-27T00:00:00.000Z');
  });

  it('hoyEnOrganizacion sin organización usa la zona por defecto', async () => {
    const hoy = await hoyEnOrganizacion({}, null, new Date('2026-09-28T01:56:00Z'));
    expect(hoy.toISOString()).toBe('2026-09-27T00:00:00.000Z');
  });
});
