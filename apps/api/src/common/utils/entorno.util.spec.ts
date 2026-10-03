import { describe, expect, it } from 'vitest';
import { revisarEntorno } from './entorno.util';

const SECRETO = 'a'.repeat(48);
const base = { DATABASE_URL: 'postgresql://u:c@localhost:5432/gym', JWT_SECRET: SECRETO };
const produccion = { ...base, NODE_ENV: 'production', FRONTEND_URL: 'https://gym.ejemplo.com' };

describe('revisar la configuración al arrancar', () => {
  it('una configuración completa pasa sin avisos', () => {
    expect(revisarEntorno(base)).toEqual({ errores: [], avisos: [] });
    expect(revisarEntorno(produccion)).toEqual({ errores: [], avisos: [] });
  });

  it('sin base de datos o sin secreto no arranca, en ningún entorno', () => {
    const { errores } = revisarEntorno({});
    expect(errores.some((e) => e.startsWith('Falta DATABASE_URL'))).toBe(true);
    expect(errores.some((e) => e.startsWith('Falta JWT_SECRET'))).toBe(true);
    expect(revisarEntorno({ ...base, DATABASE_URL: 'mysql://x' }).errores[0]).toContain('postgresql://');
  });

  it('un secreto corto o de muestra: en producción no arranca, en desarrollo avisa', () => {
    const corto = { ...produccion, JWT_SECRET: 'corto' };
    expect(revisarEntorno(corto).errores[0]).toContain('muy corto (5 caracteres');
    expect(revisarEntorno({ ...base, JWT_SECRET: 'corto' })).toMatchObject({ errores: [], avisos: [expect.stringContaining('muy corto')] });
    const muestra = { ...produccion, JWT_SECRET: 'cambia-esto-por-un-secreto-largo-y-aleatorio' };
    expect(revisarEntorno(muestra).errores[0]).toContain('valor de muestra');
  });

  it('en producción la web tiene que estar y usar https', () => {
    const sinWeb = { ...produccion, FRONTEND_URL: '' };
    expect(revisarEntorno(sinWeb).errores[0]).toContain('Falta FRONTEND_URL');
    expect(revisarEntorno({ ...produccion, FRONTEND_URL: 'http://gym.ejemplo.com' }).errores[0]).toContain('https://');
    // En desarrollo, http y varias separadas por coma.
    expect(revisarEntorno({ ...base, FRONTEND_URL: 'http://localhost:3000, http://localhost:3100' }).errores).toEqual([]);
    expect(revisarEntorno({ ...base, FRONTEND_URL: 'localhost:3000' }).errores[0]).toContain('no es válida');
  });

  it('un número mal escrito ya no se ignora en silencio', () => {
    const { errores } = revisarEntorno({ ...base, LIMITE_LOGIN: 'cinco', SESION_HORAS: '0', PORT: '99999', LOGIN_BLOQUEO_MIN: '15' });
    expect(errores).toEqual([
      'PORT tiene que ser un número de puerto (vale "99999").',
      'LIMITE_LOGIN tiene que ser un número entero mayor que 0 (vale "cinco").',
      'SESION_HORAS tiene que ser un número entero mayor que 0 (vale "0").',
    ]);
    // Vacía es "no está" (así llegan desde docker-compose.prod.yml).
    expect(revisarEntorno({ ...base, LIMITE_LOGIN: '', REDIS_URL: '' }).errores).toEqual([]);
    expect(revisarEntorno({ ...base, REDIS_URL: 'localhost:6379' }).errores[0]).toContain('redis://');
    expect(revisarEntorno({ ...base, NODE_ENV: 'produccion' }).errores[0]).toContain('NODE_ENV');
  });
});
