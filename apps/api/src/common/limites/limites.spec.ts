import { describe, expect, it } from 'vitest';
import { leerLimites } from './limites';
import { enteroDeEntorno } from '../utils/entorno.util';
import { aQuienSeCuenta } from './limite.guard';
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

  it('el bloqueo por cuenta no distingue mayúsculas ni espacios', () => {
    expect(cuentaDeCorreo('  Dueno@GymTitan.com ')).toBe('dueno@gymtitan.com');
  });
});
