import path from 'node:path';
import { config } from 'dotenv';

// Dónde y con qué corre la tanda de pruebas e2e (docs/plan-pruebas-e2e.md).
// Todo sale del .env de la raíz (en el CI, de las variables del trabajo), pero
// con su propia base de datos, otra base de Redis y otros puertos: nunca toca
// lo de desarrollo.

export const RAIZ = path.resolve(__dirname, '../..');
const delArchivo = config({ path: path.join(RAIZ, '.env') }).parsed ?? {};
const base: Record<string, string | undefined> = { ...delArchivo, ...process.env };

const PUERTO_API = 3101;
const PUERTO_WEB = 3100;
export const URL_API = `http://localhost:${PUERTO_API}`;
export const URL_WEB = `http://localhost:${PUERTO_WEB}`;

if (!base.DATABASE_URL) throw new Error('Falta DATABASE_URL (en el .env de la raíz o en el entorno).');
if (!base.JWT_SECRET) throw new Error('Falta JWT_SECRET (en el .env de la raíz o en el entorno).');

const bd = new URL(base.DATABASE_URL);
// Solo contra una base de esta máquina: la tanda la borra entera.
if (!['localhost', '127.0.0.1'].includes(bd.hostname)) {
  throw new Error(`Las pruebas e2e solo corren contra una base local, y DATABASE_URL apunta a ${bd.hostname}.`);
}
bd.pathname = '/gym_e2e';
export const DATABASE_URL_E2E = bd.toString();

const redis = new URL(base.REDIS_URL || 'redis://localhost:6380');
redis.pathname = '/1';

/** Variables para la API y la web de la tanda (y para preparar la base). */
export const ENTORNO: Record<string, string> = {
  DATABASE_URL: DATABASE_URL_E2E,
  REDIS_URL: redis.toString(),
  JWT_SECRET: base.JWT_SECRET,
  PORT: String(PUERTO_API),
  FRONTEND_URL: URL_WEB,
  // Cada pantalla hace varios pedidos y la tanda inicia sesión muchas veces
  // desde la misma máquina: con los límites normales fallaría al azar
  // (decisión E4; ver apps/api/src/common/limites). Los valores de producción
  // los prueban las pruebas de la API (limites.spec.ts).
  LIMITE_GENERAL: '100000',
  LIMITE_LOGIN: '100000',
  LIMITE_REPORTES: '100000',
  LIMITE_PESADO: '100000',
  // Bajo, para probar el bloqueo por cuenta sin 10 intentos (seguridad.spec.ts).
  LOGIN_FALLOS_MAX: '3',
  NEXT_PUBLIC_API_URL: URL_API,
  NEXT_DIST_DIR: '.next-e2e',
};
