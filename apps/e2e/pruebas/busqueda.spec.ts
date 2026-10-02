import { tituloDePagina } from './ayudas';
import { expect, sesion, test } from './base';

// Recorrido 3 (docs/plan-pruebas-e2e.md): la paleta de comandos.
test.use({ storageState: sesion('dueno') });

test('Ctrl+K abre la búsqueda, encuentra por un nombre viejo y lleva a la pantalla', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  const buscador = page.getByPlaceholder('Busca una pantalla o una acción…');
  await expect(buscador).toBeVisible();

  // "Transacciones" es el nombre de antes de Movimientos.
  await buscador.fill('transacciones');
  await expect(page.getByRole('option', { name: 'Movimientos' })).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/dashboard\/transacciones$/);
  await expect(tituloDePagina(page)).toHaveText('Movimientos');
  await expect(buscador).toBeHidden();
});

test('el botón "Buscar…" abre la misma búsqueda, con las acciones rápidas', async ({ page }) => {
  await page.goto('/dashboard/clientes');
  await page.getByRole('button', { name: 'Buscar…' }).click();
  const buscador = page.getByPlaceholder('Busca una pantalla o una acción…');
  await expect(buscador).toBeVisible();
  for (const accion of ['Nuevo cliente', 'Vender membresía', 'Registrar ingreso', 'Registrar gasto']) {
    await expect(page.getByRole('option', { name: accion })).toBeVisible();
  }
  // Ya en Clientes, "Nuevo cliente" abre el formulario sin salir de la página.
  await page.getByRole('option', { name: 'Nuevo cliente' }).click();
  await expect(page.getByRole('dialog', { name: 'Nuevo Cliente' })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/clientes$/);
});

test('Escape cierra la búsqueda', async ({ page }) => {
  await page.goto('/dashboard');
  await page.keyboard.press('Control+k');
  const buscador = page.getByPlaceholder('Busca una pantalla o una acción…');
  await expect(buscador).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(buscador).toBeHidden();
});
