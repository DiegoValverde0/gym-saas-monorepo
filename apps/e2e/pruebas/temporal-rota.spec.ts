import { expect, sesion, test } from './base';

// TEMPORAL (fase 5): rota a propósito para comprobar que el CI queda en rojo
// y guarda el reporte. Se borra en el commit siguiente.
test.use({ storageState: sesion('dueno') });

test('prueba rota a propósito', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Esta pantalla no existe' })).toBeVisible({ timeout: 2000 });
});
