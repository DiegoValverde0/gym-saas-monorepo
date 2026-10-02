import type { Page, PlaywrightWorkerArgs } from '@playwright/test';
import { URL_API } from '../entorno';
import { expect, sesion } from './base';

/**
 * Cambia la configuración del gimnasio como el dueño desde Configuración
 * (PUT /organizaciones/me/info, que combina con lo que ya hay).
 */
export async function configurarGimnasio(playwright: PlaywrightWorkerArgs['playwright'], configuracion: Record<string, unknown>) {
  const api = await playwright.request.newContext({ storageState: sesion('dueno') });
  const r = await api.put(`${URL_API}/organizaciones/me/info`, { data: { configuracion } });
  expect(r.ok(), `No se pudo configurar el gimnasio: ${r.status()} ${await r.text()}`).toBeTruthy();
  await api.dispose();
}

export const menuPrincipal = (page: Page) => page.getByRole('navigation', { name: 'Menú principal' });

/** Lo que muestra el sidebar: cada grupo con sus pantallas (nombre y ruta). */
export async function leerMenu(page: Page): Promise<{ grupo: string; pantallas: { nombre: string; href: string }[] }[]> {
  const nav = menuPrincipal(page);
  await expect(nav).toBeVisible();
  // Mientras cargan los permisos y la configuración del gimnasio, el menú está "ocupado".
  await expect(nav).toHaveAttribute('aria-busy', 'false');
  return nav.evaluate((n) =>
    [...n.querySelectorAll('[role=group]')].map((g) => ({
      grupo: g.querySelector('p')?.textContent?.trim() ?? '',
      pantallas: [...g.querySelectorAll('a')].map((a) => ({ nombre: a.textContent?.trim() ?? '', href: a.getAttribute('href') ?? '' })),
    })),
  );
}

/** El menú como { grupo: [pantallas] }, para compararlo con lo esperado. */
export const comoTabla = (menu: Awaited<ReturnType<typeof leerMenu>>) => Object.fromEntries(menu.map((g) => [g.grupo, g.pantallas.map((p) => p.nombre)]));

/** El título de la página (el primer h1 o h2 del contenido). */
export const tituloDePagina = (page: Page) => page.locator('main').locator('h1, h2').first();
