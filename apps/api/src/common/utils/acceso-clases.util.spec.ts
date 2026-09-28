import { describe, expect, it } from 'vitest';
import { decidirReserva, MembresiaParaReserva } from './acceso-clases.util';

const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);
const mensual: MembresiaParaReserva = { id: 'm1', planId: 'plan-mensual', fechaInicio: dia('2026-09-01'), fechaFin: dia('2026-09-30'), plan: { nombre: 'Mensual' } };

describe('decidirReserva', () => {
  it('una clase abierta la reserva cualquiera, aun sin membresía', () => {
    expect(decidirReserva({ modo: 'ABIERTA' }, [], dia('2026-09-15'), 'Juan Pérez', 'Yoga').permitido).toBe(true);
  });

  it('sin membresía vigente ese día: motivo para recepción y para el cliente', () => {
    const recepcion = decidirReserva({ modo: 'MIEMBROS' }, [mensual], dia('2026-10-02'), 'Juan Pérez', 'Yoga');
    expect(recepcion).toMatchObject({ permitido: false, motivo: 'Juan no tiene una membresía activa para el 02/10/2026.' });
    const portal = decidirReserva({ modo: 'MIEMBROS' }, [mensual], dia('2026-10-02'), 'Juan Pérez', 'Yoga', 'segunda');
    expect(portal.motivo).toBe('No tienes una membresía activa para el 02/10/2026.');
  });

  it('con membresía vigente ese día, reserva', () => {
    expect(decidirReserva({ modo: 'MIEMBROS' }, [mensual], dia('2026-09-30'), 'Juan', 'Yoga')).toMatchObject({ permitido: true, membresiaId: 'm1' });
  });

  it('solo algunos planes: rechaza con el nombre de su plan', () => {
    const regla = { modo: 'PLANES' as const, planIds: ['plan-premium'] };
    expect(decidirReserva(regla, [mensual], dia('2026-09-15'), 'Juan', 'Spinning', 'segunda').motivo).toBe('Tu plan Mensual no incluye Spinning.');
    expect(decidirReserva({ ...regla, planIds: ['plan-mensual'] }, [mensual], dia('2026-09-15'), 'Juan', 'Spinning').permitido).toBe(true);
  });
});
