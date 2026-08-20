import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/**
 * Extensión de Prisma para manejar Multi-Tenant via RLS
 * Inyecta el ID de la organización en la sesión de base de datos antes de las consultas.
 */
export function getPrismaClientForTenant(organizacionId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          // Establecer el tenant ID en el contexto transaccional de PostgreSQL
          await prisma.$executeRawUnsafe(
            `SELECT set_config('app.current_tenant_id', '${organizacionId}', TRUE)`
          );
          return query(args);
        },
      },
    },
  });
}
