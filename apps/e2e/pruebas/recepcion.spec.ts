import { expect, sesion, test, unico } from './base';

// Recorridos 4 y 5 (docs/plan-pruebas-e2e.md): un día de recepción, en orden.
// Abre la caja, registra un cliente nuevo, le vende una membresía en
// efectivo, registra su ingreso y cierra la caja con lo contado. Cada paso
// usa lo que dejó el anterior.
test.describe.configure({ mode: 'serial' });
test.use({ storageState: sesion('recepcion') });

const CLIENTE = unico('Cliente');
const MONTO_INICIAL = 100;
// El plan del seed (packages/database/prisma/seed.ts).
const PLAN = 'Mensual Musculación';
const PRECIO = 300;

test('abre la caja', async ({ page }) => {
  await page.goto('/dashboard/cajas');
  await expect(page.getByText('No tienes un turno abierto')).toBeVisible();
  await page.getByRole('row', { name: /Caja Recepción Central/ }).getByRole('button', { name: 'Abrir Turno' }).click();

  const dialogo = page.getByRole('dialog', { name: 'Abrir Turno de Caja' });
  await dialogo.getByLabel('Monto Inicial (Efectivo en Caja en Bs.)').fill(String(MONTO_INICIAL));
  await dialogo.getByRole('button', { name: 'Guardar' }).click();

  await expect(dialogo).toBeHidden();
  await expect(page.getByRole('button', { name: 'Cerrar Turno (Arqueo)' })).toBeVisible();
});

test('registra un cliente nuevo', async ({ page }) => {
  await page.goto('/dashboard/clientes');
  await page.getByRole('button', { name: 'Nuevo Cliente' }).click();

  const dialogo = page.getByRole('dialog', { name: 'Nuevo Cliente' });
  await dialogo.getByLabel('Nombre Completo').fill(CLIENTE);
  await dialogo.getByLabel('Teléfono').fill('70012345');
  await dialogo.getByRole('button', { name: 'Guardar Cliente' }).click();

  await expect(dialogo).toBeHidden();
  await page.getByPlaceholder('Buscar cliente...').fill(CLIENTE);
  await expect(page.getByRole('row', { name: new RegExp(CLIENTE) })).toBeVisible();
});

test('le vende una membresía en efectivo', async ({ page }) => {
  await page.goto('/dashboard/membresias');
  await page.getByRole('button', { name: 'Nueva Venta' }).click();

  const dialogo = page.getByRole('dialog', { name: 'Vender membresía' });
  await dialogo.getByLabel('Cliente').fill(CLIENTE);
  // El resultado de la búsqueda (no el botón "agregar a …", que también lo nombra).
  await dialogo.getByRole('button', { name: new RegExp(`^${CLIENTE}`) }).click();
  await dialogo.getByRole('button', { name: new RegExp(PLAN) }).click();
  await dialogo.getByRole('button', { name: 'Efectivo', exact: true }).click();
  await dialogo.getByLabel('Cuenta donde entra el dinero').selectOption({ label: 'Efectivo · Efectivo del gimnasio' });
  await dialogo.getByRole('button', { name: `Cobrar Bs. ${PRECIO.toFixed(2)}` }).click();

  await expect(page.getByText('Venta registrada')).toBeVisible();
  await expect(dialogo).toBeHidden();
  await page.getByPlaceholder('Buscar membresía...').fill(CLIENTE);
  const fila = page.getByRole('row', { name: new RegExp(CLIENTE) });
  await expect(fila).toContainText(PLAN);
  await expect(fila).toContainText(/activa/i);
});

test('registra su ingreso y aparece adentro', async ({ page }) => {
  await page.goto('/dashboard/asistencias');
  await page.getByPlaceholder('Buscar por nombre, documento o correo...').fill(CLIENTE);
  await page.getByRole('button', { name: new RegExp(CLIENTE) }).click();

  await expect(page.getByText('ACCESO PERMITIDO')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar Ingreso' }).click();

  await expect(page.getByText('Ingreso registrado')).toBeVisible();
  await expect(page.getByRole('tab', { name: /Adentro \(1\)/ })).toBeVisible();
  // La lista de quienes están adentro (la que tiene el botón para registrar la salida).
  const adentro = page.getByRole('tabpanel').filter({ has: page.getByRole('button', { name: 'Registrar salida' }) });
  await expect(adentro.getByText(CLIENTE)).toBeVisible();
  // Y la búsqueda queda lista para el siguiente cliente.
  await expect(page.getByPlaceholder('Buscar por nombre, documento o correo...')).toHaveValue('');
});

test('cierra la caja con lo contado y sin descuadre', async ({ page }) => {
  await page.goto('/dashboard/cajas');
  await page.getByRole('button', { name: 'Cerrar Turno (Arqueo)' }).click();

  const dialogo = page.getByRole('dialog', { name: 'Arqueo y Cierre de Caja' });
  // En la gaveta: el monto inicial más la venta en efectivo (100 + 300 = 4 billetes de 100).
  const esperado = MONTO_INICIAL + PRECIO;
  await dialogo.getByLabel('Cantidad de billetes de Bs. 100').fill(String(esperado / 100));
  await expect(dialogo.getByText(`Bs. ${esperado.toFixed(2)}`).first()).toBeVisible();
  await dialogo.getByRole('button', { name: 'Siguiente' }).click();

  // El sistema esperaba lo mismo que se contó.
  await expect(dialogo.getByText('Monto Esperado (Sistema)', { exact: true }).locator('..')).toContainText(`Bs. ${esperado.toFixed(2)}`);
  await expect(dialogo.getByText('Descuadre', { exact: true }).locator('..')).toContainText('0.00');
  await dialogo.getByRole('button', { name: 'Confirmar Cierre de Caja' }).click();

  await expect(dialogo).toBeHidden();
  await expect(page.getByText('No tienes un turno abierto')).toBeVisible();
});
