import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { ENTORNO, RAIZ, URL_API, URL_WEB } from './entorno';

// Pruebas de punta a punta (docs/plan-pruebas-e2e.md). Correr con `pnpm e2e`
// desde la raíz: primero prepara la base y compila (scripts/preparar.ts).
export default defineConfig({
  testDir: './pruebas',
  // Todas comparten la misma base de datos: de a una, en orden.
  workers: 1,
  fullyParallel: false,
  // Una prueba que falla al azar se arregla, no se reintenta (y reintentar
  // gasta los 5 inicios de sesión por minuto que permite la API).
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: URL_WEB,
    locale: 'es-BO',
    timezoneId: 'America/La_Paz',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Inicia sesión una vez por rol y guarda la sesión (pruebas/sesiones.setup.ts).
    { name: 'sesiones', testMatch: /sesiones\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['sesiones'] },
  ],
  webServer: [
    {
      name: 'API',
      command: 'node dist-e2e/main.js',
      cwd: path.join(RAIZ, 'apps/api'),
      url: `${URL_API}/health`,
      env: { ...(process.env as Record<string, string>), ...ENTORNO },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      name: 'Web',
      command: 'pnpm exec next start -p 3100',
      cwd: path.join(RAIZ, 'apps/web'),
      url: `${URL_WEB}/login`,
      env: { ...(process.env as Record<string, string>), ...ENTORNO },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
