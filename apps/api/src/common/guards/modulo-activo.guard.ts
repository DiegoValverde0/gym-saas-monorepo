import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { MODULO_KEY, ModuloTenant } from '../decorators/requiere-modulo.decorator';

// Deben coincidir con los defaults del frontend (configuracion/page.tsx y
// dashboard/layout.tsx) cuando la organización todavía no guardó nada explícito.
const MODULOS_POR_DEFECTO: Record<ModuloTenant, boolean> = {
  puntoVenta: true,
  clasesGrupales: false,
  controlPersonal: false,
  reportesAvanzados: true,
};

// Registrado como APP_GUARD (ver app.module.ts): corre en todas las rutas
// pero no hace nada salvo que el controller/handler lleve @RequiereModulo().
// Antes, apagar un módulo en Configuración solo ocultaba el link del sidebar
// (y el Command Palette ni eso) -- la API seguía aceptando esas operaciones
// sin importar el toggle.
@Injectable()
export class ModuloActivoGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const modulo = this.reflector.getAllAndOverride<ModuloTenant | undefined>(MODULO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!modulo) return true;

    // El superadmin de plataforma no opera dentro de un tenant -- este
    // catálogo de funciones activables es un concepto exclusivo de tenant.
    if (this.cls.get('is_superadmin')) return true;

    const organizacionId = this.cls.get('organizacionId');
    if (!organizacionId) {
      throw new ForbiddenException('Tenant no identificado en la sesión.');
    }

    const org = await this.prisma.extendedClient.organizacion.findUnique({
      where: { id: organizacionId },
      select: { configuracion: true },
    });
    const modulos = (org?.configuracion as { modulos?: Partial<Record<ModuloTenant, boolean>> } | null)?.modulos;
    const activo = modulos?.[modulo] ?? MODULOS_POR_DEFECTO[modulo];

    if (!activo) {
      throw new ForbiddenException('Este módulo no está activado para tu organización. Actívalo en Configuración.');
    }

    return true;
  }
}
