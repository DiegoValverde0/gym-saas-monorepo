import { URL_API } from '../entorno';
import { expect, sesion, test } from './base';

// El Inicio (docs/plan-inicio.md): indicadores con comparación y tarjetas, según el rol.

test.describe('dueño', () => {
  test.use({ storageState: sesion('dueno') });

  test('abre con los ingresos del mes en grande y las cuatro tarjetas', async ({ page }) => {
    await page.goto('/dashboard');
    const mes = page.getByRole('region', { name: 'Ingresos del mes' });
    await expect(mes).toBeVisible();
    await expect(mes).toContainText(/Bs\. [\d.]+,\d{2}/);
    await expect(mes).toContainText('El mes pasado cerró en');
    for (const nombre of ['Ingresos de hoy', 'Asistencias de hoy', 'Clientes activos', 'Vencen en 7 días']) {
      await expect(page.getByRole('region', { name: nombre })).toBeVisible();
    }
    // Lo primero del Inicio, antes que los primeros pasos y los vencimientos.
    const orden = await page.locator('main').evaluate((m) => {
      const pos = (t: string) => [...m.querySelectorAll('*')].findIndex((e) => e.getAttribute?.('aria-label') === t || e.textContent?.trim() === t);
      return pos('Ingresos del mes') < pos('Membresías por vencer esta semana');
    });
    expect(orden).toBe(true);
  });

  test('muestra las tarjetas del diseño sugerido, con sus gráficos', async ({ page }) => {
    await page.goto('/dashboard');
    const tarjeta = (id: string) => page.locator(`[data-tarjeta="${id}"]`);
    await expect(tarjeta('plantilla:ingresos-anio-vs-pasado')).toContainText('Ingresos por mes: este año y los anteriores');
    // El seed no trae asistencias recientes: el mapa de calor o su aviso de vacío.
    const horas = tarjeta('plantilla:horas-pico');
    await expect(horas.getByRole('table', { name: /Mapa de calor/ }).or(horas.getByText('No hay datos en este período.'))).toBeVisible();
    await expect(tarjeta('estado-clientes')).toContainText('Al día');
    await expect(tarjeta('por-vencer')).toContainText('Membresías por vencer esta semana');
    // El período de una tarjeta se cambia ahí mismo.
    await tarjeta('plantilla:horas-pico').getByLabel(/Período de/).selectOption('ultimos_7');
    await expect(tarjeta('plantilla:horas-pico').getByLabel(/Período de/)).toHaveValue('ultimos_7');
  });
});

test.describe('instructor', () => {
  test.use({ storageState: sesion('instructor') });

  test('no ve los ingresos, ni en la pantalla ni en lo que manda la API', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('region', { name: 'Asistencias de hoy' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Clientes activos' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ingresos del mes' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Ingresos de hoy' })).toHaveCount(0);
    // Sin reportes ni membresías: solo el estado de los clientes.
    await expect(page.locator('[data-tarjeta="estado-clientes"]')).toBeVisible();
    await expect(page.locator('[data-tarjeta^="plantilla:"]')).toHaveCount(0);
    await expect(page.locator('[data-tarjeta="por-vencer"]')).toHaveCount(0);

    const respuesta = await page.request.get(`${URL_API}/dashboard/kpis`);
    expect(respuesta.ok()).toBeTruthy();
    expect((await respuesta.json()).data.ingresos).toBeNull();
  });
});
