import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('nestjs-cls', () => ({
  ClsService: class {},
  ClsServiceManager: { getClsService: () => ({ isActive: () => false, get: () => undefined }) },
}));

import { KioscoService } from './kiosco.service';
import { hashContrasena } from '../../common/utils/contrasena.util';

// Redis en memoria: contadores de intentos.
function redisFalso() {
  const datos = new Map<string, number>();
  return {
    datos,
    get: async (k: string) => (datos.has(k) ? String(datos.get(k)) : null),
    del: async (k: string) => { datos.delete(k); },
    multi() {
      const ops: (() => void)[] = [];
      const cadena = {
        incr: (k: string) => { ops.push(() => datos.set(k, (datos.get(k) ?? 0) + 1)); return cadena; },
        expire: () => cadena,
        exec: async () => ops.forEach((op) => op()),
      };
      return cadena;
    },
  };
}

describe('KioscoService', () => {
  let db: Record<string, Record<string, ReturnType<typeof vi.fn>>>;
  let asistencia: { validateAccess: ReturnType<typeof vi.fn>; checkIn: ReturnType<typeof vi.fn> };
  let redis: ReturnType<typeof redisFalso>;
  let kiosco: KioscoService;
  const user = { sub: 'recepcion-1', organizacionId: 'org-1' };

  beforeEach(() => {
    db = {
      cliente: { findFirst: vi.fn() },
      membresia: { findUnique: vi.fn() },
      organizacion: { findUnique: vi.fn(), update: vi.fn() },
      auditoria: { create: vi.fn() },
    };
    asistencia = { validateAccess: vi.fn(), checkIn: vi.fn().mockResolvedValue({ clasesMarcadas: [] }) };
    redis = redisFalso();
    const cls = { get: (k: string) => (k === 'organizacionId' ? 'org-1' : undefined) };
    kiosco = new KioscoService({ extendedClient: db } as never, cls as never, asistencia as never, redis as never);
  });

  it('busca el documento exacto (sin espacios) y saluda solo con el primer nombre', async () => {
    db.cliente.findFirst.mockResolvedValue({ id: 'c1', nombre: 'Juan Perez (Titan)' });
    asistencia.validateAccess.mockResolvedValue({ allowed: true, membresiaId: 'm1' });
    db.membresia.findUnique.mockResolvedValue({ fechaFin: new Date('2026-10-27T00:00:00Z'), sesionesRestantes: null, plan: { tipoPlan: 'TIEMPO' } });

    const r = await kiosco.ingresar(' 1234567 ', 'suc-1', user);

    expect(db.cliente.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { numeroDocumento: '1234567' } }));
    expect(r).toEqual({ resultado: 'BIENVENIDO', nombre: 'Juan', sesionesRestantes: null, venceEl: '2026-10-27', clases: [] });
    // Siempre un ingreso por día, aunque quien abrió el kiosco pueda más.
    expect(asistencia.validateAccess).toHaveBeenCalledWith('c1', user, 'suc-1', true);
    expect(asistencia.checkIn).toHaveBeenCalledWith({ clienteId: 'c1', sucursalId: 'suc-1' }, user, 'CODIGO_PIN');
  });

  it('explica el rechazo en segunda persona y no registra el ingreso', async () => {
    db.cliente.findFirst.mockResolvedValue({ id: 'c1', nombre: 'Ana' });
    asistencia.validateAccess.mockResolvedValue({ allowed: false, codigo: 'SIN_MEMBRESIA' });
    expect(await kiosco.ingresar('1', 'suc-1', user)).toEqual({ resultado: 'RECHAZADO', nombre: 'Ana', mensaje: 'No tienes una membresía activa.' });

    asistencia.validateAccess.mockResolvedValue({ allowed: false, codigo: 'YA_INGRESO' });
    expect((await kiosco.ingresar('1', 'suc-1', user)).resultado).toBe('YA_INGRESO');
    expect(asistencia.checkIn).not.toHaveBeenCalled();
  });

  it('bloquea 5 minutos tras 10 documentos desconocidos seguidos', async () => {
    db.cliente.findFirst.mockResolvedValue(null);
    for (let i = 0; i < 10; i++) expect((await kiosco.ingresar('999', 'suc-1', user)).resultado).toBe('NO_ENCONTRADO');
    await expect(kiosco.ingresar('999', 'suc-1', user)).rejects.toThrow('Demasiados intentos');
  });

  it('salir pide el PIN correcto; sin PIN definido se sale libremente', async () => {
    db.organizacion.findUnique.mockResolvedValue({ id: 'org-1', configuracion: { kiosco: { pinHash: await hashContrasena('2468') } } });
    await expect(kiosco.salir('1111', user)).rejects.toThrow('PIN incorrecto');
    await expect(kiosco.salir('2468', user)).resolves.toEqual({ ok: true });

    db.organizacion.findUnique.mockResolvedValue({ id: 'org-1', configuracion: null });
    await expect(kiosco.salir('0000', user)).resolves.toEqual({ ok: true });
  });

  it('bloquea la salida tras 5 PIN incorrectos', async () => {
    db.organizacion.findUnique.mockResolvedValue({ id: 'org-1', configuracion: { kiosco: { pinHash: await hashContrasena('2468') } } });
    for (let i = 0; i < 5; i++) await expect(kiosco.salir('1111', user)).rejects.toThrow('PIN incorrecto');
    await expect(kiosco.salir('2468', user)).rejects.toThrow('Demasiados intentos');
  });

  it('definirPin guarda solo el hash; sin PIN lo quita', async () => {
    db.organizacion.findUnique.mockResolvedValue({ id: 'org-1', configuracion: { modoUso: 'experto' } });
    await kiosco.definirPin('2468');
    const guardado = db.organizacion.update.mock.calls[0][0].data.configuracion;
    expect(guardado.modoUso).toBe('experto');
    expect(guardado.kiosco.pinHash).not.toContain('2468');

    await expect(kiosco.definirPin(undefined)).resolves.toEqual({ tienePin: false });
    expect(db.organizacion.update.mock.calls[1][0].data.configuracion.kiosco.pinHash).toBe('');
  });
});
