import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisClientType } from 'redis';
import { PERMISSIONS_KEY, PermissionRequirement } from '../decorators/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { formatPermiso } from '../utils/permiso.util';
import { obtenerAccesoVigente } from '../utils/acceso-vigente.util';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
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

    // Permisos del acceso vigente (misma caché de Redis que usa JwtAuthGuard
    // para el rol y la sucursal). Superadmin puro: asignación global.
    const acceso = await obtenerAccesoVigente(this.prisma, this.redisClient, user.sub, user.organizacionId ?? null);
    if (!acceso) {
      throw new ForbiddenException('El usuario no tiene un rol asignado en este tenant.');
    }
    const userPermissions = acceso.permisos;

    // Validar si el usuario tiene todos los permisos requeridos
    const hasPermission = requiredPermissions.every((reqPerm) =>
      userPermissions.includes(formatPermiso(reqPerm.modulo, reqPerm.accion)),
    );

    if (!hasPermission) {
      throw new ForbiddenException('No tienes permisos suficientes para realizar esta acción.');
    }

    // Quedan en el pedido para lo que muestra más o menos según el rol (por
    // ejemplo, los ingresos del Inicio solo con transacciones:leer).
    request.permisos = userPermissions;
    return true;
  }
}
