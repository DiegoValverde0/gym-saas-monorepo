import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    // Las pruebas no dependen de la zona horaria de la máquina: se fija UTC,
    // como en un servidor real (ver zona-horaria.util.ts).
    env: { TZ: 'UTC' },
  },
});
