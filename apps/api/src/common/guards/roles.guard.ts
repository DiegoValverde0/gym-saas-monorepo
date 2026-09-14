import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, PermissionRequirement } from '../decorators/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { formatPermiso } from '../utils/permiso.util';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redisClient: any,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<PermissionRequirement[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // Si no hay decorador, asume que está protegido solo por JwtAuthGuard
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user; // Esto viene del JwtAuthGuard

    if (!user || !user.sub) {
      throw new ForbiddenException('Usuario no identificado en la sesión.');
    }

    // No hay bypass para superadmin: sus permisos vienen de su propio rol
    // global SUPERADMIN (AsignacionAcceso con organizacionId: null), sembrado
    // con un catálogo deliberadamente acotado (ver seed.ts). Así, recortar o
    // ampliar lo que puede hacer un superadmin es editar esa fila, no el guard.
    // Un superadmin puro tiene organizacionId null de forma legítima.
    if (!user.organizacionId && !user.is_superadmin) {
      throw new ForbiddenException('Tenant no identificado en la sesión.');
    }

    const cacheKey = `rbac:${user.sub}:${user.organizacionId ?? 'global'}`;
    let userPermissionsStr = await this.redisClient.get(cacheKey);
    let userPermissions: string[] = [];

    if (userPermissionsStr) {
      userPermissions = JSON.parse(userPermissionsStr);
    } else {
      // 1. Buscar el rol de este usuario: en su organización (usuario normal)
      // o su asignación global (superadmin, organizacionId: null).
      const asignacion = await this.prisma.asignacionAcceso.findFirst({
        where: {
          usuarioId: user.sub,
          organizacionId: user.organizacionId ?? null,
        },
        include: {
          rol: {
            include: {
              rolPermisos: {
                include: {
                  permiso: true,
                },
              },
            },
          },
        },
      });

      if (!asignacion || !asignacion.rol) {
        throw new ForbiddenException('El usuario no tiene un rol asignado en este tenant.');
      }

      // 2. Extraer permisos (Formato: "accion:modulo")
      userPermissions = asignacion.rol.rolPermisos.map(
        (rp) => formatPermiso(rp.permiso.modulo, rp.permiso.accion),
      );

      // 3. Guardar en Redis con TTL de 15 minutos (900 segundos)
      await this.redisClient.setEx(cacheKey, 900, JSON.stringify(userPermissions));
    }

    // 4. Validar si el usuario tiene todos los permisos requeridos
    const hasPermission = requiredPermissions.every((reqPerm) =>
      userPermissions.includes(formatPermiso(reqPerm.modulo, reqPerm.accion)),
    );

    if (!hasPermission) {
      throw new ForbiddenException('No tienes permisos suficientes para realizar esta acción.');
    }

    return true;
  }
}
