module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'turbo'
  ],
  env: {
    node: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist', 'node_modules', '.next', '.turbo'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    'react-hooks/exhaustive-deps': 'off',
    'react-hooks/set-state-in-effect': 'off',
    'react-hooks/incompatible-library': 'off',
    'react-hooks/static-components': 'off',
    'react-hooks/purity': 'off'
  },
  overrides: [
    {
      // Prohíbe usar el cliente Prisma "crudo" (this.prisma.<modelo>) fuera de
      // this.prisma.extendedClient -- el crudo se salta por completo el
      // aislamiento multi-tenant (RLS) de PrismaService (ver
      // apps/api/src/prisma/prisma.service.ts y Auditoria_Claude.md). Los
      // pocos usos legítimos (bootstrap de organizaciones, lookup de
      // RolesGuard) están explícitamente exceptuados abajo.
      files: ['apps/api/src/**/*.ts'],
      excludedFiles: [
        'apps/api/src/modules/organizacion/organizacion.service.ts',
        'apps/api/src/common/guards/roles.guard.ts',
        // Edita los 5 roles globales del sistema (organizacionId null) para
        // el superadmin -- el cliente crudo es intencional ahí, ver el
        // comentario en rol.service.ts#update().
        'apps/api/src/modules/rol/rol.service.ts',
        // SELECT 1 de healthcheck: no toca ningún modelo ni dato de tenant.
        'apps/api/src/modules/health/health.service.ts',
        // Sus 2 cron jobs diarios (handleAnulacionMembresiasPendientes,
        // handleVencimientoMembresiasActivas) operan cross-tenant por diseño
        // (recorren TODAS las organizaciones), así que no hay un
        // organizacionId de request del cual colgarse -- usan el cliente
        // crudo a propósito. El resto de los métodos de este servicio (los
        // que sí atienden peticiones HTTP de un tenant) siguen usando
        // extendedClient con normalidad; revisar ese uso en review de código.
        'apps/api/src/modules/membresia/membresia.service.ts',
        // handleAutoCheckout (cron diario) recorre TODAS las organizaciones
        // igual que los crons de membresia.service.ts de arriba -- mismo motivo.
        'apps/api/src/modules/asistencia/asistencia.service.ts',
        // generarParaOrganizacion (llamado tanto por el cron diario
        // handleGeneracionDiaria, que recorre TODAS las organizaciones, como
        // por generarAhora vía HTTP) recibe organizacionId como parámetro
        // explícito y lo usa en cada where -- no hay un tenant de request del
        // cual colgarse dentro del cron, mismo motivo que membresia/asistencia.
        'apps/api/src/modules/turno-plantilla/turno-plantilla.service.ts',
        // signIn() lee el Usuario y sus AsignacionAcceso (tenant-scoped) ANTES
        // de que exista un organizacionId en el contexto (CLS) -- login es la
        // operación que determina a qué tenant(s) pertenece el usuario, así
        // que no puede depender de un tenant ya resuelto. Ver comentario en
        // el propio método.
        'apps/api/src/modules/auth/auth.service.ts',
      ],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            // Antes esta regla exceptuaba cualquier método `this.prisma.$algo`
            // (p.ej. $transaction, $queryRaw) en TODO el repo, no solo en
            // excludedFiles -- dejaba invisible al linter el patrón más
            // peligroso de fuga de RLS: this.prisma.$transaction(tx =>
            // tx.modelo.x(...)), que opera con el cliente crudo dentro del
            // callback. Ahora $-métodos también quedan prohibidos fuera de
            // excludedFiles, forzando a usar this.prisma.extendedClient.$transaction
            // (que sí propaga el RLS a `tx`, ver prisma.service.ts).
            selector:
              "MemberExpression[object.type='MemberExpression'][object.object.type='ThisExpression'][object.property.name='prisma']:not([property.name='extendedClient'])",
            message:
              'Usa this.prisma.extendedClient.<modelo> (o this.prisma.extendedClient.$transaction) en vez de this.prisma.<modelo>/this.prisma.$algo directo: el cliente crudo se salta el aislamiento multi-tenant (RLS) de PrismaService. Si es un caso legítimo, agrega el archivo a "excludedFiles" en .eslintrc.js con un comentario explicando por qué.',
          },
        ],
      },
    },
  ],
};
