import { beforeEach, describe, expect, it, vi } from 'vitest';

// El contexto de la petición (quién, desde dónde, en qué organización).
const contexto: Record<string, unknown> = {};
let activo = true;
vi.mock('nestjs-cls', () => ({
  ClsServiceManager: { getClsService: () => ({ isActive: () => activo, get: (k: string) => contexto[k] }) },
}));

import { descripcionEliminar, etiquetaRegistro, nombreRolLegible, registrarAuditoria, seccionLegible } from './auditoria.util';

describe('textos de la auditoría', () => {
  it('describe una eliminación con el nombre del registro', () => {
    expect(descripcionEliminar('Cliente', { nombre: 'Juan Perez' })).toBe('Eliminó el cliente "Juan Perez"');
    expect(descripcionEliminar('ClaseProgramada', { nombreClase: 'Spinning' }, 'Restauró')).toBe('Restauró la sesión "Spinning"');
  });

  it('sin nombre usa el monto, y si no hay nada queda solo el tipo', () => {
    expect(etiquetaRegistro({ montoTotal: '80' })).toBe('de Bs. 80.00');
    expect(descripcionEliminar('Transaccion', { id: 'x' })).toBe('Eliminó el movimiento');
  });

  it('usa los nombres de roles y secciones que ve el usuario', () => {
    expect(nombreRolLegible('RECEPCIONISTA')).toBe('Recepción');
    expect(nombreRolLegible('Gerente')).toBe('Gerente');
    expect(seccionLegible('jornadas')).toBe('tolerancia de atrasos');
  });
});

describe('registrarAuditoria', () => {
  const crear = vi.fn();
  const db = { auditoria: { create: crear } };
  const evento = { tabla: 'planes', operacion: 'UPDATE' as const, accion: 'cambiar_precio', descripcion: 'Cambió el precio' };

  beforeEach(() => {
    crear.mockReset();
    activo = true;
    Object.assign(contexto, { organizacionId: 'org-1', usuarioId: 'u-1', ip: '10.0.0.1', is_superadmin: false });
  });

  it('anota quién, desde dónde y qué', async () => {
    await registrarAuditoria(db, { ...evento, antes: { precio: 300 }, despues: { precio: 320 } });
    expect(crear).toHaveBeenCalledWith({
      data: expect.objectContaining({
        usuarioId: 'u-1',
        ipOrigen: '10.0.0.1',
        tablaAfectada: 'planes',
        operacion: 'UPDATE',
        valoresAnteriores: { precio: 300 },
        valoresNuevos: { accion: 'cambiar_precio', descripcion: 'Cambió el precio', precio: 320 },
      }),
    });
  });

  it('no anota nada del superadmin ni fuera de una organización', async () => {
    contexto.is_superadmin = true;
    await registrarAuditoria(db, evento);
    contexto.is_superadmin = false;
    contexto.organizacionId = undefined;
    await registrarAuditoria(db, evento);
    activo = false;
    await registrarAuditoria(db, evento);
    expect(crear).not.toHaveBeenCalled();
  });

  it('si anotar falla, no rompe la acción', async () => {
    crear.mockRejectedValueOnce(new Error('base caída'));
    await expect(registrarAuditoria(db, evento)).resolves.toBeUndefined();
  });
});
