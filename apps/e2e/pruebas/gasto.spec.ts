import { expect, sesion, test, unico } from './base';

// Recorrido 6 (docs/plan-pruebas-e2e.md): el dueño registra un gasto desde la
// búsqueda (acción rápida) y lo ve en Gastos y en Movimientos.
test.use({ storageState: sesion('dueno') });

test('registra un gasto y aparece en Gastos y en Movimientos', async ({ page }) => {
  const detalle = unico('Arreglo de máquina');
  await page.goto('/dashboard/gastos');
  await page.getByRole('button', { name: 'Buscar…' }).click();
  await page.getByRole('option', { name: 'Registrar gasto' }).click();

  const dialogo = page.getByRole('dialog', { name: 'Registrar gasto' });
  await dialogo.getByLabel('Monto (Bs.)').fill('75');
  await dialogo.getByRole('button', { name: 'Mantenimiento', exact: true }).click();
  await dialogo.getByLabel('Detalle del gasto').fill(detalle);
  await dialogo.getByRole('button', { name: 'Efectivo', exact: true }).click();
  await dialogo.getByLabel('Cuenta de la que sale el dinero').selectOption({ label: 'Efectivo · Efectivo del gimnasio' });
  await dialogo.getByRole('button', { name: 'Registrar gasto de Bs. 75.00' }).click();

  await expect(page.getByText('Gasto registrado')).toBeVisible();
  await expect(dialogo).toBeHidden();

  await page.reload();
  await expect(page.getByRole('row', { name: new RegExp(detalle) })).toContainText('75');

  await page.goto('/dashboard/transacciones');
  await expect(page.getByRole('row', { name: new RegExp(detalle) })).toContainText('75');
});
