import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

vi.mock('nestjs-cls', () => ({
  ClsService: class {},
  ClsServiceManager: { getClsService: () => ({ isActive: () => false, get: () => undefined }) },
}));

import { PortalService } from './portal.service';

describe('PortalService: todo sobre la ficha de quien entra', () => {
  let db: Record<string, Record<string, ReturnType<typeof vi.fn>>>;
  let reservas: { cancelar: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  let portal: PortalService;
  const contexto: Record<string, string> = { organizacionId: 'org-1', clienteId: 'cliente-mio' };

  beforeEach(() => {
    db = { reservaClase: { findFirst: vi.fn() } };
    reservas = { cancelar: vi.fn(), create: vi.fn() };
    const cls = { get: (k: string) => contexto[k] };
    portal = new PortalService({ extendedClient: db } as never, cls as never, reservas as never);
  });

  it('cancelar busca la reserva solo entre las del cliente de la sesión', async () => {
    db.reservaClase.findFirst.mockResolvedValue(null); // es de otro cliente
    await expect(portal.cancelar('reserva-ajena')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.reservaClase.findFirst.mock.calls[0][0].where).toEqual({ id: 'reserva-ajena', clienteId: 'cliente-mio' });
    expect(reservas.cancelar).not.toHaveBeenCalled();
  });

  it('no deja cancelar una clase que ya empezó', async () => {
    db.reservaClase.findFirst.mockResolvedValue({ id: 'r1', estado: 'CONFIRMADA', clase: { fechaHora: new Date(Date.now() - 60_000) } });
    await expect(portal.cancelar('r1')).rejects.toThrow('La clase ya empezó');
    expect(reservas.cancelar).not.toHaveBeenCalled();
  });

  it('cancela una reserva propia y futura', async () => {
    db.reservaClase.findFirst.mockResolvedValue({ id: 'r1', estado: 'EN_ESPERA', clase: { fechaHora: new Date(Date.now() + 3_600_000) } });
    reservas.cancelar.mockResolvedValue({ id: 'r1', estado: 'CANCELADA', promovidos: [] });
    await expect(portal.cancelar('r1')).resolves.toEqual({ id: 'r1', estado: 'CANCELADA' });
  });
});
