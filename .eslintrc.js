module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
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
      ],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector:
              "MemberExpression[object.type='MemberExpression'][object.object.type='ThisExpression'][object.property.name='prisma']:not([property.name='extendedClient']):not([property.name=/^\\$/])",
            message:
              'Usa this.prisma.extendedClient.<modelo> en vez de this.prisma.<modelo> directo: el cliente crudo se salta el aislamiento multi-tenant (RLS) de PrismaService. Si es un caso legítimo (ej. Organizacion, que no tiene organizacionId), agrega el archivo a "excludedFiles" en .eslintrc.js.',
          },
        ],
      },
    },
  ],
};
