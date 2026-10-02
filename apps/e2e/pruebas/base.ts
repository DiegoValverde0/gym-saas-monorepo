import path from 'node:path';
import { test as base, expect } from '@playwright/test';
import { URL_API } from '../entorno';

export { expect };

export type Rol = 'dueno' | 'recepcion' | 'instructor';

// Cuentas del seed (packages/database/prisma/seed.ts).
export const CUENTAS: Record<Rol, { correo: string; contrasena: string; nombre: string }> = {
  dueno: { correo: 'dueno@gymtitan.com', contrasena: 'admin123', nombre: 'Dueño Gym Titan' },
  recepcion: { correo: 'ana@gymtitan.com', contrasena: 'ana123', nombre: 'Ana Recepción' },
  instructor: { correo: 'carlos@gymtitan.com', contrasena: 'carlos123', nombre: 'Carlos Instructor' },
};

/** Sesión guardada de un rol (la inicia pruebas/sesiones.setup.ts). */
export const sesion = (rol: Rol) => path.join(__dirname, '..', '.sesiones', `${rol}.json`);

/** Un texto distinto en cada corrida, para lo que crean las pruebas. */
export const unico = (prefijo: string) => `${prefijo} E2E ${Date.now().toString(36)}`;

/**
 * Todas las pruebas fallan ante un error de la página, aunque no lo estén
 * buscando: un error de JavaScript, una respuesta 500 de la API o la pantalla
 * "Application error" de Next. (Así se habría visto que la paleta de comandos
 * se caía al abrirse.)
 */
export const test = base.extend<{ vigilarErrores: void }>({
  vigilarErrores: [
    async ({ page }, use) => {
      const errores: string[] = [];
      page.on('pageerror', (e) => errores.push(`Error en la página: ${e.message}`));
      page.on('response', (r) => {
        if (r.status() >= 500 && r.url().startsWith(URL_API)) errores.push(`La API respondió ${r.status()} a ${r.request().method()} ${r.url()}`);
      });
      await use();
      if (await page.getByText('Application error: a client-side exception').count().catch(() => 0)) {
        errores.push('Next mostró "Application error: a client-side exception"');
      }
      expect(errores, 'Errores durante la prueba').toEqual([]);
    },
    { auto: true },
  ],
});
