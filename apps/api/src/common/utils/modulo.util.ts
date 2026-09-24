import { PrismaService } from '../../prisma/prisma.service';
import { ModuloTenant } from '../decorators/requiere-modulo.decorator';

// Deben coincidir con los defaults del frontend (configuracion/page.tsx,
// dashboard/layout.tsx, use-modulos-activos.ts) cuando la organización
// todavía no guardó nada explícito. Único lugar que los define -- antes
// modulo-activo.guard.ts tenía su propia copia.
export const MODULOS_POR_DEFECTO: Record<ModuloTenant, boolean> = {
  puntoVenta: true,
  clasesGrupales: false,
  controlPersonal: false,
  reportesAvanzados: true,
  controlGastos: false,
};

// Lectura puntual del catálogo de módulos de una organización. Usado por
// ModuloActivoGuard (chequeo declarativo vía @RequiereModulo en controllers
// dedicados) y, para controllers compartidos donde una sola ruta atiende
// varios "productos" a la vez (ej. TransaccionController sirve tanto ventas
// como gastos), como chequeo manual dentro del propio service.
export async function moduloEstaActivo(prisma: PrismaService, organizacionId: string, modulo: ModuloTenant): Promise<boolean> {
  const org = await prisma.extendedClient.organizacion.findUnique({
    where: { id: organizacionId },
    select: { configuracion: true },
  });
  const modulos = (org?.configuracion as { modulos?: Partial<Record<ModuloTenant, boolean>> } | null)?.modulos;
  return modulos?.[modulo] ?? MODULOS_POR_DEFECTO[modulo];
}
