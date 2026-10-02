import { execSync } from 'node:child_process';
import path from 'node:path';
import { DATABASE_URL_E2E, ENTORNO, RAIZ } from '../entorno';

// Antes de cada tanda (docs/plan-pruebas-e2e.md): base gym_e2e recién
// sembrada y copias compiladas de la API (apps/api/dist-e2e) y de la web
// (apps/web/.next-e2e), aparte de las de desarrollo. Con --sin-compilar se
// reutilizan las copias de la tanda anterior.

const sinCompilar = process.argv.includes('--sin-compilar');

function paso(titulo: string, comando: string, cwd = RAIZ) {
  const inicio = Date.now();
  console.log(`\n▶ ${titulo}`);
  execSync(comando, { cwd, stdio: 'inherit', env: { ...process.env, ...ENTORNO } });
  console.log(`  listo en ${Math.round((Date.now() - inicio) / 1000)} s`);
}

if (!DATABASE_URL_E2E.includes('/gym_e2e')) throw new Error('La base de las pruebas tiene que ser gym_e2e.');

// Crea gym_e2e si no existe, aplica las migraciones y siembra. --skip-generate:
// no regenera el cliente de Prisma, que en Windows puede estar en uso por la API
// de desarrollo.
paso('Base de datos gym_e2e (migraciones y seed)', 'pnpm --filter @repo/database exec prisma migrate reset --force --skip-generate');

if (!sinCompilar) {
  paso('Compilar la API (apps/api/dist-e2e)', 'pnpm exec tsc -p tsconfig.json --outDir dist-e2e', path.join(RAIZ, 'apps/api'));
  paso('Compilar la web (apps/web/.next-e2e)', 'pnpm exec next build', path.join(RAIZ, 'apps/web'));
}
