import { URL_API } from '../entorno';
import { expect, sesion, test } from './base';

// Seguridad (docs/plan-seguridad.md): el bloqueo por cuenta contra la API y
// el Redis de verdad (fase 2; en la tanda, LOGIN_FALLOS_MAX es 3, ver
// apps/e2e/entorno.ts) y las cabeceras de la web y la API (fase 3).

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

test('la web no se deja meter en un iframe ni cargar scripts de otros sitios, y no anuncia con qué está hecha', async ({ page }) => {
  const r = await page.goto('/login');
  const h = r!.headers();
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['content-security-policy']).toContain("default-src 'self'");
  expect(h['content-security-policy']).not.toContain('unsafe-eval');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['x-powered-by']).toBeUndefined();
  // Con esas reglas la página funciona igual: el formulario está.
  await expect(page.getByLabel('Correo Electrónico')).toBeVisible();
});

test('la API responde con sus cabeceras de seguridad', async ({ playwright }) => {
  const api = await playwright.request.newContext();
  const h = (await api.get(`${URL_API}/health`)).headers();
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-powered-by']).toBeUndefined();
  await api.dispose();
});

test('las pantallas principales funcionan sin violar la política de contenido', async ({ browser }) => {
  const contexto = await browser.newContext({ storageState: sesion('dueno') });
  const page = await contexto.newPage();
  const violaciones: string[] = [];
  page.on('console', (m) => /Content Security Policy|Refused to/i.test(m.text()) && violaciones.push(m.text()));
  for (const ruta of ['/dashboard', '/dashboard/clientes', '/dashboard/membresias', '/dashboard/reporteria', '/dashboard/configuracion']) {
    await page.goto(ruta);
    await page.waitForLoadState('networkidle');
  }
  expect(violaciones).toEqual([]);
  await contexto.close();
});
