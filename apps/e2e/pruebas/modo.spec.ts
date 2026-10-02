import { comoTabla, configurarGimnasio, leerMenu, tituloDePagina } from './ayudas';
import { expect, sesion, test } from './base';

// Recorrido 9 (docs/plan-pruebas-e2e.md): en modo simple el menú se achica.
test.use({ storageState: sesion('dueno') });

test('en modo simple el menú se achica y la reportería se llama "Reportes listos"', async ({ page, playwright }) => {
  await configurarGimnasio(playwright, { modoUso: 'simple' });
  try {
    await page.goto('/dashboard');
    expect(comoTabla(await leerMenu(page))).toEqual({
      'Día a día': ['Asistencias', 'Clientes', 'Membresías'],
      Clases: ['Clases'],
      'Lo que vendes': ['Planes', 'Productos'],
      Finanzas: ['Movimientos', 'Gastos'],
      Equipo: ['Personal'],
      Reportes: ['Resumen del negocio', 'Reportes listos'],
      Ajustes: ['Sucursales', 'Configuración'],
    });
    await page.goto('/dashboard/reporteria');
    await expect(tituloDePagina(page)).toHaveText('Reportes listos');
  } finally {
    await configurarGimnasio(playwright, { modoUso: 'intermedio' });
  }
});
