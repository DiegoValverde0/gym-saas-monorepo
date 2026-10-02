import { URL_API } from '../entorno';
import { expect, sesion, test } from './base';

// El Inicio (docs/plan-inicio.md): indicadores con comparación, según el rol.

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
});

test.describe('instructor', () => {
  test.use({ storageState: sesion('instructor') });

  test('no ve los ingresos, ni en la pantalla ni en lo que manda la API', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('region', { name: 'Asistencias de hoy' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Clientes activos' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ingresos del mes' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Ingresos de hoy' })).toHaveCount(0);

    const respuesta = await page.request.get(`${URL_API}/dashboard/kpis`);
    expect(respuesta.ok()).toBeTruthy();
    expect((await respuesta.json()).data.ingresos).toBeNull();
  });
});
