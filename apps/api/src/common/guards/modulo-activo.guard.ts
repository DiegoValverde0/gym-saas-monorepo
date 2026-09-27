import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { MODULO_KEY, ModuloTenant } from '../decorators/requiere-modulo.decorator';
import { moduloEstaActivo } from '../utils/modulo.util';

// Se agrega explícitamente a @UseGuards(...) en cada controller que deba
// respetar el catálogo de módulos de Configuración (junto con @RequiereModulo
// en la clase) -- no corre solo, hay que sumarlo en ambos lugares (ver
// asistencia/inventario/turno-plantilla/etc. controller.ts como ejemplo).
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

    const activo = await moduloEstaActivo(this.prisma, organizacionId, modulo);

    if (!activo) {
      throw new ForbiddenException('Este módulo no está activado para tu organización. Actívalo en Configuración.');
    }

    return true;
  }
}
