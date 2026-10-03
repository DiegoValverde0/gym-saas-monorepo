import { describe, expect, it } from 'vitest';
import { DemasiadosIntentosException, Intentos } from './intentos';
import { redisEnMemoria } from '../../pruebas/redis-en-memoria';

const MINUTO = 60_000;
const regla = { maximo: 3, ventanaMs: 15 * MINUTO, bloqueoMs: 10 * MINUTO, mensaje: 'Espera.' };
const nuevo = () => {
  const redis = redisEnMemoria();
  return { redis, intentos: new Intentos(redis as never, 'login', regla) };
};

describe('intentos fallidos con bloqueo', () => {
  it('bloquea al llegar al máximo, con los segundos que faltan', async () => {
    const { redis, intentos } = nuevo();
    expect(await intentos.fallo('ana')).toBe(false);
    expect(await intentos.fallo('ana')).toBe(false);
    await expect(intentos.revisar('ana')).resolves.toBeUndefined();
    expect(await intentos.fallo('ana')).toBe(true);

    const bloqueo = await intentos.revisar('ana').catch((e) => e);
    expect(bloqueo).toBeInstanceOf(DemasiadosIntentosException);
    expect(bloqueo.getStatus()).toBe(429);
    expect(bloqueo.segundos).toBe(600);
    redis.avanzar(4 * MINUTO);
    expect((await intentos.revisar('ana').catch((e) => e)).segundos).toBe(360);
    // Otra cuenta no se entera.
    await expect(intentos.revisar('luis')).resolves.toBeUndefined();
  });

  it('el bloqueo termina solo, y la cuenta empieza de nuevo', async () => {
    const { redis, intentos } = nuevo();
    for (let i = 0; i < 3; i++) await intentos.fallo('ana');
    redis.avanzar(10 * MINUTO);
    await expect(intentos.revisar('ana')).resolves.toBeUndefined();
    expect(await intentos.fallo('ana')).toBe(false);
  });

  it('un acierto borra los fallos', async () => {
    const { intentos } = nuevo();
    await intentos.fallo('ana');
    await intentos.fallo('ana');
    await intentos.exito('ana');
    expect(await intentos.fallo('ana')).toBe(false);
    expect(await intentos.fallo('ana')).toBe(false);
    expect(await intentos.fallo('ana')).toBe(true);
  });

  it('los fallos viejos se olvidan: la ventana empieza con el primero y no se alarga', async () => {
    const { redis, intentos } = nuevo();
    await intentos.fallo('ana');
    redis.avanzar(10 * MINUTO);
    await intentos.fallo('ana');
    redis.avanzar(6 * MINUTO); // pasaron 16 minutos desde el primero
    expect(await intentos.fallo('ana')).toBe(false);
  });
});
