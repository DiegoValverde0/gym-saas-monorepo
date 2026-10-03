// Las cuentas de prueba del seed de desarrollo, en un solo lugar
// (docs/plan-seguridad.md, fase 4). Solo existen en bases de prueba: el seed
// se niega a correr en producción (solo-pruebas.ts), donde se usa inicial.ts
// con el superadmin de las variables de entorno. No son secretos: cualquiera
// que vea el repositorio las conoce, por eso nunca deben llegar a un servidor.
//
// Las usan el seed (seed.ts), las pruebas e2e (apps/e2e/pruebas/base.ts) y la
// caja "Cuentas de prueba" del login, que solo se ve en desarrollo.
export const CUENTAS_PRUEBA = {
  superadmin: { quien: 'Plataforma', nombre: 'Super Admin', correo: 'admin@gymmanager.com', contrasena: 'admin123' },
  dueno: { quien: 'Dueño', nombre: 'Dueño Gym Titan', correo: 'dueno@gymtitan.com', contrasena: 'admin123' },
  recepcion: { quien: 'Recepción', nombre: 'Ana Recepción', correo: 'ana@gymtitan.com', contrasena: 'ana123' },
  instructor: { quien: 'Instructor', nombre: 'Carlos Instructor', correo: 'carlos@gymtitan.com', contrasena: 'carlos123' },
  cliente: { quien: 'Cliente', nombre: 'Juan Perez (Titan)', correo: 'juan.titan@ejemplo.com', contrasena: 'juan123' },
} as const;
