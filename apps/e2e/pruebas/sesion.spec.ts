import { CUENTAS, expect, sesion, test } from './base';

// Recorrido 1 (docs/plan-pruebas-e2e.md): iniciar y cerrar sesión.

test('el dueño inicia sesión, ve el Inicio y cierra sesión', async ({ page }) => {
  const { correo, contrasena, nombre } = CUENTAS.dueno;
  await page.goto('/login');
  await page.getByLabel('Correo Electrónico').fill(correo);
  await page.getByLabel('Contraseña').fill(contrasena);
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Menú principal' })).toBeVisible();

  await page.getByRole('button', { name: new RegExp(nombre) }).click();
  await page.getByRole('button', { name: 'Cerrar Sesión' }).click();
  await expect(page).toHaveURL(/\/login/);
  // Ya sin sesión, el panel lleva de vuelta al inicio de sesión.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});

test('con la clave equivocada no entra y lo dice', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Correo Electrónico').fill(CUENTAS.dueno.correo);
  await page.getByLabel('Contraseña').fill('no-es-la-clave');
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByText('Credenciales inválidas')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test.describe('con la sesión guardada', () => {
  test.use({ storageState: sesion('recepcion') });

  test('recepción entra directo al panel', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
    await expect(page.getByText(CUENTAS.recepcion.nombre)).toBeVisible();
  });
});
