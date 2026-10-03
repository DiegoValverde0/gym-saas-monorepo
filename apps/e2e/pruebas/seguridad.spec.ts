import { URL_API } from '../entorno';
import { expect, sesion, test } from './base';

// Seguridad (docs/plan-seguridad.md, fase 2): el bloqueo por cuenta contra la
// API y el Redis de verdad. En la tanda, LOGIN_FALLOS_MAX es 3 (apps/e2e/entorno.ts).

// Un correo que no existe: el bloqueo cuenta igual (así no se puede saber qué
// correos existen) y no toca las cuentas que usan las demás pruebas. Uno nuevo
// en cada tanda: el bloqueo de la anterior sigue en Redis hasta 15 minutos.
const CORREO = `bloqueo.${Date.now()}@ejemplo.test`;

test('tras 3 contraseñas equivocadas el correo espera, aunque cambie las mayúsculas', async ({ playwright }) => {
  const api = await playwright.request.newContext();
  const entrar = (correo: string) => api.post(`${URL_API}/auth/login`, { data: { correo, contrasena: 'equivocada' } });

  expect((await entrar(CORREO)).status()).toBe(401);
  expect((await entrar(CORREO.toUpperCase())).status()).toBe(401);
  expect((await entrar(` ${CORREO}`)).status()).toBe(400); // con espacios no es un correo válido: no cuenta
  expect((await entrar(CORREO)).status()).toBe(401);

  const bloqueado = await entrar(CORREO);
  expect(bloqueado.status()).toBe(429);
  expect((await bloqueado.json()).message).toContain('Demasiados intentos con esta cuenta');
  const espera = Number(bloqueado.headers()['retry-after']);
  expect(espera).toBeGreaterThan(0);
  expect(espera).toBeLessThanOrEqual(15 * 60);
  await api.dispose();
});

test('las demás cuentas siguen entrando y usando el sistema', async ({ browser }) => {
  const contexto = await browser.newContext({ storageState: sesion('dueno') });
  const r = await contexto.request.get(`${URL_API}/auth/me`);
  expect(r.ok()).toBeTruthy();
  // Los límites avisan cuántos pedidos quedan.
  expect(Number(r.headers()['x-ratelimit-remaining'])).toBeGreaterThan(0);
  await contexto.close();
});
