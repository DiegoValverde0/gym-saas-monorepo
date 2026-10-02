import { menuPrincipal, tituloDePagina } from './ayudas';
import { expect, sesion, test } from './base';

// Recorrido 8 (docs/plan-pruebas-e2e.md): el panel en un celular.
test.use({ storageState: sesion('recepcion'), viewport: { width: 390, height: 844 } });

const barra = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Accesos rápidos' });

test('la barra de abajo lleva a lo de todos los días y marca dónde está', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(barra(page).getByRole('link')).toHaveText(['Inicio', 'Asistencias', 'Clientes', 'Membresías']);
  await expect(barra(page).getByRole('button', { name: 'Abrir el menú completo' })).toBeVisible();
  // El sidebar no se ve en el celular.
  await expect(menuPrincipal(page)).toBeHidden();

  await barra(page).getByRole('link', { name: 'Clientes' }).click();
  await expect(page).toHaveURL(/\/dashboard\/clientes$/);
  await expect(barra(page).locator('[aria-current="page"]')).toHaveText('Clientes');
});

test('"Menú" abre el menú completo y se cierra al elegir una pantalla', async ({ page }) => {
  await page.goto('/dashboard');
  await barra(page).getByRole('button', { name: 'Abrir el menú completo' }).click();
  const panel = page.getByRole('dialog');
  await expect(panel.getByRole('navigation', { name: 'Menú principal' })).toBeVisible();
  await panel.getByRole('link', { name: 'Planes', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/planes$/);
  await expect(tituloDePagina(page)).toContainText('Planes');
  await expect(panel).toBeHidden();
});

test('la barra no tapa el contenido ni los avisos', async ({ page }) => {
  await page.goto('/dashboard/clientes');
  const altoBarra = await barra(page).evaluate((b) => b.getBoundingClientRect().height);
  // El contenido deja abajo al menos el alto de la barra.
  const espacioAbajo = await page.locator('main').evaluate((m) => parseFloat(getComputedStyle(m).paddingBottom));
  expect(espacioAbajo).toBeGreaterThanOrEqual(altoBarra);
  // Lo que está fijo abajo (avisos, guías) se corre hacia arriba.
  const corrimiento = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--barra-inferior').trim());
  expect(corrimiento).not.toBe('');
  // Y la página no se desborda a lo ancho.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('en la tablet de marcaje no hay barra', async ({ page }) => {
  await page.goto('/dashboard/marcaje');
  await expect(tituloDePagina(page)).toContainText('Marca tu entrada o salida');
  await expect(barra(page)).toHaveCount(0);
});
