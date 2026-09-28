import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvisosProgramadosService } from './avisos-programados.service';

const ORG = 'org-1';
const LA_PAZ = 'America/La_Paz';
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);
// 10:00 del 28/09 en La Paz.
const A_LAS_10 = new Date('2026-09-28T14:00:00Z');

function membresia(id: string, clienteId: string, fechaFin: string, usuarioId: string | null = `u-${clienteId}`) {
  return { id, clienteId, fechaFin: dia(fechaFin), plan: { nombre: 'Mensual' }, cliente: { usuarioId } };
}

describe('AvisosProgramadosService', () => {
  let db: Record<string, Record<string, ReturnType<typeof vi.fn>>>;
  let servicio: AvisosProgramadosService;

  beforeEach(() => {
    db = {
      membresia: { findMany: vi.fn() },
      reservaClase: { findMany: vi.fn().mockResolvedValue([]) },
      notificacion: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn() },
    };
    servicio = new AvisosProgramadosService(db as never);
  });

  // membresia.findMany: 1) por vencer, 2) vencidas, 3) renovaciones.
  function membresias(porVencer: unknown[], vencidas: unknown[], siguientes: unknown[] = []) {
    db.membresia.findMany.mockResolvedValueOnce(porVencer).mockResolvedValueOnce(vencidas).mockResolvedValueOnce(siguientes);
  }

  it('avisa por vencer, vence hoy y vencida, sin repetir los que ya existen', async () => {
    membresias([membresia('m1', 'c1', '2026-10-01'), membresia('m2', 'c2', '2026-09-28')], [membresia('m3', 'c3', '2026-09-26')]);
    db.notificacion.findMany.mockResolvedValue([{ usuarioDestinoId: 'u-c1', tipo: 'POR_VENCER:m1' }]);

    const creados = await servicio.generarAvisos(ORG, LA_PAZ, A_LAS_10);

    expect(creados).toBe(2);
    const datos = db.notificacion.createMany.mock.calls[0][0].data;
    expect(datos.map((d: { tipo: string }) => d.tipo)).toEqual(['VENCE_HOY:m2', 'VENCIDA:m3']);
    expect(datos[0]).toMatchObject({ organizacionId: ORG, usuarioDestinoId: 'u-c2', titulo: 'Tu membresía vence hoy' });
  });

  it('no avisa a quien ya renovó', async () => {
    membresias([membresia('m1', 'c1', '2026-10-01')], [membresia('m3', 'c3', '2026-09-26')], [{ clienteId: 'c1' }, { clienteId: 'c3' }]);
    expect(await servicio.generarAvisos(ORG, LA_PAZ, A_LAS_10)).toBe(0);
    expect(db.notificacion.createMany).not.toHaveBeenCalled();
  });

  it('de madrugada solo manda recordatorios de clases, no avisos de membresía', async () => {
    db.reservaClase.findMany.mockResolvedValue([
      { id: 'r1', cliente: { usuarioId: 'u-c1' }, clase: { nombreClase: 'Spinning', fechaHora: new Date('2026-09-28T10:00:00Z'), sucursal: { nombre: 'Central' } } },
    ]);
    const creados = await servicio.generarAvisos(ORG, LA_PAZ, new Date('2026-09-28T08:00:00Z')); // 04:00 en La Paz
    expect(creados).toBe(1);
    expect(db.membresia.findMany).not.toHaveBeenCalled();
    expect(db.notificacion.createMany.mock.calls[0][0].data[0]).toMatchObject({
      tipo: 'RECORDATORIO:r1',
      mensaje: 'Spinning es hoy a las 06:00 en Central. ¡Te esperamos!',
    });
  });
});
