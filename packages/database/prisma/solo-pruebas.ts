// El seed de desarrollo y `pnpm db:reset` BORRAN TODA LA BASE y crean cuentas
// con contraseñas conocidas (cuentas-prueba.ts). Este freno los deja correr
// solo contra una base de esta misma computadora y nunca con
// NODE_ENV=production (docs/plan-seguridad.md, fase 4). Para un servidor de
// pruebas de verdad: SEED_PERMITIDO=si.

const LOCALES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** El motivo por el que no se puede sembrar esta base, o null si se puede. */
export function motivoParaNoSembrar(entorno: NodeJS.ProcessEnv): string | null {
  if (entorno.SEED_PERMITIDO === 'si') return null;
  if (entorno.NODE_ENV === 'production') return 'NODE_ENV es production.';
  let servidor: string;
  try {
    servidor = new URL(entorno.DATABASE_URL ?? '').hostname;
  } catch {
    return 'DATABASE_URL no está o no es una dirección válida.';
  }
  if (!LOCALES.has(servidor)) return `la base está en "${servidor}", no en esta computadora.`;
  return null;
}

/** Corta el proceso si la base no es de pruebas. */
export function asegurarBaseDePruebas(entorno: NodeJS.ProcessEnv = process.env): void {
  const motivo = motivoParaNoSembrar(entorno);
  if (!motivo) return;
  console.error(
    `\n✋ No se siembra ni se borra esta base: ${motivo}\n` +
      '   El seed y db:reset borran todo y crean cuentas de prueba con contraseñas conocidas.\n' +
      '   En producción se usa `pnpm db:inicial`. Si de verdad es una base de pruebas en otro\n' +
      '   servidor, corre el comando con SEED_PERMITIDO=si.\n',
  );
  process.exit(1);
}
