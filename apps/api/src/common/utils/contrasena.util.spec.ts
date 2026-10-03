import { describe, expect, it } from 'vitest';
import { hashContrasena, verificarHash } from './contrasena.util';
import { hashPassword } from '../../../../../packages/database/prisma/base';

// Las contraseñas se guardan con este formato desde dos lugares: la API
// (contrasena.util.ts) y la carga inicial y el seed (packages/database/prisma/
// base.ts, otro paquete que no puede importar código de la API). Esta prueba
// los ata: si uno cambia de formato, falla.
describe('el formato de las contraseñas guardadas', () => {
  it('la API reconoce las que guarda ella misma', async () => {
    const guardada = await hashContrasena('una-clave');
    expect(await verificarHash('una-clave', guardada)).toBe(true);
    expect(await verificarHash('otra-clave', guardada)).toBe(false);
  });

  it('la API reconoce las que guardan la carga inicial y el seed', async () => {
    const guardada = hashPassword('una-clave');
    expect(guardada).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(await verificarHash('una-clave', guardada)).toBe(true);
    expect(await verificarHash('otra-clave', guardada)).toBe(false);
  });

  it('un valor guardado roto no deja entrar (y no rompe nada)', async () => {
    expect(await verificarHash('x', '')).toBe(false);
    expect(await verificarHash('x', 'sin-dos-puntos')).toBe(false);
    expect(await verificarHash('x', 'abcd:1234')).toBe(false);
  });
});
