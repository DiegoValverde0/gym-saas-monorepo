import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// La regla de eslint.config.mjs que prohíbe el cliente "crudo" de Prisma
// (this.prisma.<modelo>), que se salta el aislamiento entre gimnasios. Si un
// cambio de ESLint o de la configuración la apaga sin querer, esto falla.
const raiz = resolve(__dirname, '../../../..');
const eslint = new ESLint({ cwd: raiz });

async function erroresDeLaRegla(codigo: string, archivo: string) {
  const [resultado] = await eslint.lintText(codigo, { filePath: resolve(raiz, archivo), warnIgnored: false });
  return resultado.messages.filter((m) => m.ruleId === 'no-restricted-syntax');
}

const servicio = (cuerpo: string) => `
export class EjemploService {
  constructor(private readonly prisma: any) {}
  listar() {
    return ${cuerpo};
  }
}
`;

// La primera revisión carga ESLint y el analizador de TypeScript: tarda unos
// segundos, más si corren otras pruebas a la vez.
describe('regla del cliente crudo de Prisma', { timeout: 60_000 }, () => {
  it('marca this.prisma.<modelo> y this.prisma.$algo en la API', async () => {
    expect(await erroresDeLaRegla(servicio('this.prisma.cliente.findMany()'), 'apps/api/src/modules/ejemplo/ejemplo.service.ts')).toHaveLength(1);
    expect(
      await erroresDeLaRegla(servicio('this.prisma.$transaction((tx) => tx.cliente.findMany())'), 'apps/api/src/modules/ejemplo/ejemplo.service.ts'),
    ).toHaveLength(1);
  });

  it('deja pasar this.prisma.extendedClient', async () => {
    expect(
      await erroresDeLaRegla(servicio('this.prisma.extendedClient.cliente.findMany()'), 'apps/api/src/modules/ejemplo/ejemplo.service.ts'),
    ).toHaveLength(0);
  });

  it('respeta los archivos exceptuados', async () => {
    expect(await erroresDeLaRegla(servicio('this.prisma.usuario.findFirst()'), 'apps/api/src/modules/auth/auth.service.ts')).toHaveLength(0);
  });
});
