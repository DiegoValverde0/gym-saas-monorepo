import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MembresiaService } from './membresia.service';

// Cierre diario de membresías con un servidor en UTC (el caso que fallaba):
// a las 01:56 UTC del 28 en La Paz todavía son las 21:56 del 27.
describe('MembresiaService: cierre diario en la hora local', () => {
  let prisma: Record<string, Record<string, ReturnType<typeof vi.fn>>>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T01:56:00Z'));
    prisma = {
      organizacion: { findMany: vi.fn().mockResolvedValue([{ id: 'org-1', zonaHoraria: 'America/La_Paz' }]) },
      membresia: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    };
  });
  afterEach(() => vi.useRealTimers());

  it('anula solo las ventas pendientes de días anteriores (antes de la medianoche local)', async () => {
    await new MembresiaService(prisma as never).handleCierreDiarioMembresias();
    expect(prisma.membresia.updateMany).toHaveBeenCalledWith({
      where: { organizacionId: 'org-1', estado: 'PENDIENTE_PAGO', createdAt: { lt: new Date('2026-09-27T04:00:00Z') } },
      data: { estado: 'CANCELADA' },
    });
  });

  it('vence solo las membresías cuyo último día ya pasó en la hora local', async () => {
    await new MembresiaService(prisma as never).handleCierreDiarioMembresias();
    expect(prisma.membresia.findMany).toHaveBeenCalledWith({
      where: { organizacionId: 'org-1', estado: 'ACTIVA', fechaFin: { lt: new Date('2026-09-27T00:00:00Z') } },
      select: { id: true, clienteId: true },
    });
  });

  it('al vencer una, activa la siguiente en espera desde el día local', async () => {
    prisma.membresia.findMany.mockResolvedValue([{ id: 'vieja', clienteId: 'c1' }]);
    prisma.membresia.findFirst.mockResolvedValue({ id: 'nueva', organizacionId: 'org-1', plan: { tipoPlan: 'TIEMPO', duracionDias: 30 } });
    prisma.organizacion.findUnique = vi.fn().mockResolvedValue({ zonaHoraria: 'America/La_Paz' });

    await new MembresiaService(prisma as never).handleCierreDiarioMembresias();

    expect(prisma.membresia.update).toHaveBeenCalledWith({
      where: { id: 'nueva' },
      data: { estado: 'ACTIVA', fechaInicio: new Date('2026-09-27T00:00:00Z'), fechaFin: new Date('2026-10-27T00:00:00Z') },
    });
  });

  it('un fallo en una organización no frena a las demás', async () => {
    prisma.organizacion.findMany.mockResolvedValue([
      { id: 'rota', zonaHoraria: 'America/La_Paz' },
      { id: 'org-2', zonaHoraria: 'America/La_Paz' },
    ]);
    prisma.membresia.updateMany.mockRejectedValueOnce(new Error('falla')).mockResolvedValue({ count: 0 });
    await new MembresiaService(prisma as never).handleCierreDiarioMembresias();
    expect(prisma.membresia.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizacionId: 'org-2' }) }));
  });
});
