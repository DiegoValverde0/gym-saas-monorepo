import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import * as crypto from 'crypto';

@Injectable()
export class UsuarioService {
  constructor(
      private prisma: PrismaService, 
      private cls: ClsService,
      @Inject('REDIS_CLIENT') private readonly redisClient: any
  ) {}

  async listarUsuarios(): Promise<any> {
    return this.prisma.extendedClient.asignacionAcceso.findMany({
      include: {
        usuario: {
            select: {
                id: true,
                nombreCompleto: true,
                correo: true,
                telefono: true,
                estado: true,
                isSuperAdmin: true,
            }
        },
        rol: true,
        sucursal: true
      }
    });
  }

  async registrarEmpleado(data: any): Promise<any> {
    // 1. Hashear contraseña
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(data.contrasena, salt, 64).toString('hex');
    const contrasenaHash = `${salt}:${hash}`;

    // 2. Crear usuario (Global) y su AsignacionAcceso (Tenant) en una transacción
    // NOTA ARQUITECTURA: organizacionId se inyecta por RLS en AsignacionAcceso
    return this.prisma.extendedClient.$transaction(async (tx) => {
      
      // Comprobar si el correo ya existe a nivel global
      let usuario = await tx.usuario.findUnique({
        where: { correo: data.correo }
      });

      if (!usuario) {
        usuario = await tx.usuario.create({
          data: {
            nombreCompleto: data.nombreCompleto,
            correo: data.correo,
            contrasenaHash: contrasenaHash,
            telefono: data.telefono,
          }
        });
      }

      // Validar si el rol existe en esta organización (RLS aplica automáticamente)
      const rol = await tx.rol.findUnique({
        where: { id: data.rolId }
      });

      if (!rol) {
        throw new BadRequestException('El rol especificado no existe o no pertenece a su organización.');
      }

      // Crear asignación (organizacionId lo inyecta RLS)
      const asignacion = await tx.asignacionAcceso.create({
        data: {
          usuarioId: usuario.id,
          rolId: data.rolId,
          // sucursalId es opcional
          ...(data.sucursalId && { sucursalId: data.sucursalId })
        }
      });

      return { usuario, asignacion };
    });
  }

  async updateAsignacion(asignacionId: string, nuevoRolId: string, sucursalId?: string | null) {
    // Verificar que el rol existe y pertenece al tenant
    const rol = await this.prisma.extendedClient.rol.findUnique({
      where: { id: nuevoRolId },
    });

    if (!rol) {
      throw new BadRequestException('El rol especificado no existe en su organización.');
    }

    // Actualizar la asignación (extendedClient valida que la asignación pertenece al tenant)
    const asignacion = await this.prisma.extendedClient.asignacionAcceso.update({
      where: { id: asignacionId },
      data: { 
          rolId: nuevoRolId,
          sucursalId: sucursalId !== undefined ? sucursalId : undefined 
      },
    });

    // Invalidar caché de Redis
    const cacheKey = `rbac:${asignacion.usuarioId}:${asignacion.organizacionId}`;
    await this.redisClient.del(cacheKey);

    return asignacion;
  }

  async removerEmpleado(asignacionId: string) {
    // Al eliminar la asignación, revocamos el acceso del usuario a este tenant, pero el usuario global se mantiene
    const asignacion = await this.prisma.extendedClient.asignacionAcceso.delete({
      where: { id: asignacionId },
    });

    // Invalidar caché de Redis
    const cacheKey = `rbac:${asignacion.usuarioId}:${asignacion.organizacionId}`;
    await this.redisClient.del(cacheKey);

    return asignacion;
  }
}
