import { describe, expect, it } from 'vitest';
import { leerLimites } from './limites';
import { enteroDeEntorno } from '../utils/entorno.util';
import { aQuienSeCuenta, LimiteGuard } from './limite.guard';
import { cuentaDeCorreo } from '../../modules/auth/auth.service';

describe('límites de peticiones', () => {
  it('sin variables, los valores de siempre', () => {
    const l = leerLimites({});
    expect(l.general).toEqual({ limit: 100, ttl: 60_000 });
    expect(l.login).toEqual({ limit: 5, ttl: 60_000 });
    expect(l.pesado.limit).toBe(10);
    expect(l.reportes.limit).toBe(120);
    expect(l.cuenta).toEqual({ fallos: 10, ventanaMs: 15 * 60_000, bloqueoMs: 15 * 60_000 });
  });

  it('cada uno se cambia con su variable; lo que no es un entero positivo se ignora', () => {
    const l = leerLimites({ LIMITE_LOGIN: '3', LOGIN_BLOQUEO_MIN: '30', LIMITE_GENERAL: 'mucho', LIMITE_PESADO: '-1', LIMITE_REPORTES: '2.5' });
    expect(l.login.limit).toBe(3);
    expect(l.cuenta.bloqueoMs).toBe(30 * 60_000);
    expect(l.general.limit).toBe(100);
    expect(l.pesado.limit).toBe(10);
    expect(l.reportes.limit).toBe(120);
    expect(enteroDeEntorno({ X: '' }, 'X', 7)).toBe(7);
  });

  it('con una sesión válida se cuenta a la persona; sin sesión o con un token falso, a la IP', async () => {
    const verificar = async (t: string) => {
      if (t === 'bueno') return { sub: 'u1' };
      throw new Error('firma inválida');
    };
    expect(await aQuienSeCuenta('bueno', verificar, '1.2.3.4')).toBe('usuario:u1');
    expect(await aQuienSeCuenta('inventado', verificar, '1.2.3.4')).toBe('ip:1.2.3.4');
    expect(await aQuienSeCuenta(undefined, verificar, '1.2.3.4')).toBe('ip:1.2.3.4');
    expect(await aQuienSeCuenta('sin-usuario', async () => ({}), '1.2.3.4')).toBe('ip:1.2.3.4');
  });

  it('sin sesión, una IPv6 cuenta por su red (/64): cambiar de dirección dentro de la red no da más pedidos', async () => {
    // getTracker del guard de verdad, con un pedido falso y sin sesión.
    const guard = { jwt: { verifyAsync: async () => ({}) }, ipv6SubnetPrefix: 64 };
    const getTracker = (LimiteGuard.prototype as unknown as { getTracker: (req: object) => Promise<string> }).getTracker;
    const contar = (ip: string) => getTracker.call(guard, { ip, headers: {}, cookies: {} });
    expect(await contar('2001:db8:1:2:aaaa::1')).toBe(await contar('2001:db8:1:2:bbbb::2'));
    expect(await contar('2001:db8:1:2::1')).not.toBe(await contar('2001:db8:1:3::1'));
    // Una IPv4 escrita como IPv6 es la misma IPv4 (y cada IPv4 cuenta aparte).
    expect(await contar('::ffff:1.2.3.4')).toBe('ip:1.2.3.4');
    expect(await contar('1.2.3.4')).not.toBe(await contar('5.6.7.8'));
  });

  it('el bloqueo por cuenta no distingue mayúsculas ni espacios', () => {
    expect(cuentaDeCorreo('  Dueno@GymTitan.com ')).toBe('dueno@gymtitan.com');
  });
});
