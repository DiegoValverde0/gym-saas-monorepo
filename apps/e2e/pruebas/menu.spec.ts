import { comoTabla, configurarGimnasio, leerMenu, menuPrincipal, tituloDePagina } from './ayudas';
import { expect, Rol, sesion, test } from './base';

// Recorrido 2 (docs/plan-pruebas-e2e.md): cada rol ve su menú y cada pantalla
// abre sin errores, con el título igual a su nombre en el menú. El gimnasio
// tiene todos los módulos encendidos (sesiones.setup.ts).

// Pantallas cuyo título no repite el nombre del menú (decisión M1 del plan del menú).
const TITULO_DISTINTO: Record<string, string> = {
  Asistencias: 'Control de Acceso',
  'Tablet de marcaje': 'Marca tu entrada o salida',
};

const MENU_DUENO_INTERMEDIO = {
  'Día a día': ['Asistencias', 'Clientes', 'Membresías', 'Caja'],
  Clases: ['Agenda', 'Clases', 'Disciplinas'],
  'Lo que vendes': ['Planes', 'Promociones', 'Productos'],
  Finanzas: ['Movimientos', 'Gastos', 'Proveedores', 'Cuentas'],
  Equipo: ['Personal', 'Jornadas', 'Tablet de marcaje'],
  Reportes: ['Resumen del negocio', 'Reportería avanzada'],
  Ajustes: ['Sucursales', 'Roles y permisos', 'Configuración'],
};

const ESPERADO: Record<Rol, Record<string, string[]>> = {
  dueno: MENU_DUENO_INTERMEDIO,
  recepcion: {
    'Día a día': ['Asistencias', 'Clientes', 'Membresías', 'Caja'],
    Clases: ['Agenda', 'Clases', 'Disciplinas'],
    'Lo que vendes': ['Planes', 'Promociones', 'Productos'],
    Finanzas: ['Movimientos', 'Gastos', 'Proveedores', 'Cuentas'],
    Equipo: ['Jornadas', 'Tablet de marcaje'],
    Reportes: ['Resumen del negocio', 'Reportería avanzada'],
    Ajustes: ['Sucursales'],
  },
  instructor: {
    'Día a día': ['Asistencias', 'Clientes'],
    Clases: ['Agenda', 'Clases', 'Disciplinas'],
    Equipo: ['Jornadas'],
  },
};

for (const rol of Object.keys(ESPERADO) as Rol[]) {
  test.describe(`menú de ${rol}`, () => {
    test.use({ storageState: sesion(rol) });

    test('ve solo sus pantallas y cada una abre con su título', async ({ page }) => {
      await page.goto('/dashboard');
      const menu = await leerMenu(page);
      expect(comoTabla(menu)).toEqual(ESPERADO[rol]);

      for (const { nombre, href } of menu.flatMap((g) => g.pantallas)) {
        await test.step(nombre, async () => {
          await menuPrincipal(page).getByRole('link', { name: nombre, exact: true }).click();
          await expect(page).toHaveURL(new RegExp(`${href}$`));
          await expect(tituloDePagina(page)).toContainText(TITULO_DISTINTO[nombre] ?? nombre, { ignoreCase: true });
          // La pantalla actual queda marcada en el menú (y es solo una).
          await expect(menuPrincipal(page).locator('[aria-current="page"]')).toHaveText([nombre]);
          await expect(page.getByText('This page could not be found')).toHaveCount(0);
        });
      }
    });
  });
}

test.describe('menú del dueño en modo experto', () => {
  test.use({ storageState: sesion('dueno') });

  test('suma Accesos avanzados y abre', async ({ page, playwright }) => {
    await configurarGimnasio(playwright, { modoUso: 'experto' });
    try {
      await page.goto('/dashboard');
      expect(comoTabla(await leerMenu(page)).Ajustes).toEqual(['Sucursales', 'Roles y permisos', 'Accesos avanzados', 'Configuración']);
      await menuPrincipal(page).getByRole('link', { name: 'Accesos avanzados' }).click();
      await expect(tituloDePagina(page)).toContainText('Accesos avanzados');
    } finally {
      await configurarGimnasio(playwright, { modoUso: 'intermedio' });
    }
  });
});
