import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

// Acceso vigente ya en la caché de Redis, para no tocar la base.
function armarGuard(esCliente: boolean, rutaPermiteCliente: boolean) {
  const acceso = { rolNombre: esCliente ? 'CLIENTE' : 'RECEPCIONISTA', sucursalId: null, sucursalNombre: null, organizacionNombre: 'Gym', permisos: [], esCliente };
  const redis = {
    get: vi.fn(async (clave: string) => (clave.startsWith('rbac:') ? JSON.stringify(acceso) : null)),
    setEx: vi.fn(async () => undefined),
  };
  const jwt = { verifyAsync: vi.fn(async () => ({ sub: 'u1', organizacionId: 'org-1', iat: 1 })) };
  const cls = { set: vi.fn() };
  const reflector = { getAllAndOverride: vi.fn(() => rutaPermiteCliente) };
  const guard = new JwtAuthGuard(jwt as never, cls as never, {} as never, reflector as never, redis as never);
  const request: Record<string, unknown> = { cookies: { gym_token: 't' }, headers: {}, ip: '127.0.0.1' };
  const context = { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => null, getClass: () => null };
  return { guard, request, context: context as never };
}

describe('JwtAuthGuard y las cuentas del portal del cliente', () => {
  it('un cliente no entra a una ruta del panel', async () => {
    const { guard, context } = armarGuard(true, false);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un cliente entra a una ruta marcada con @PermitirCliente', async () => {
    const { guard, context, request } = armarGuard(true, true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ sub: 'u1', esCliente: true });
  });

  it('el equipo sigue entrando a las rutas del panel', async () => {
    const { guard, context } = armarGuard(false, false);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
