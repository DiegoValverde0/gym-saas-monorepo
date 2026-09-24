import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisClientType } from 'redis';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import { CreateEmpleadoDto } from './dto/create-empleado.dto';
import { assertFound } from '../../common/utils/assert-found.util';
import { hashContrasena } from '../../common/utils/contrasena.util';
import { assertRolAsignableEnOrganizacion } from '../../common/utils/rol.util';

@Injectable()
export class UsuarioService {
  constructor(
      private prisma: PrismaService, 
      private cls: ClsService,
      @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType
  ) {}

  async listarUsuarios() {
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

  async registrarEmpleado(data: CreateEmpleadoDto) {
    // 1. Hashear contraseña
    const contrasenaHash = await hashContrasena(data.contrasena);

    // 2. Crear usuario (Global) y su AsignacionAcceso (Tenant) en una transacción
    // NOTA ARQUITECTURA: organizacionId se inyecta por RLS en AsignacionAcceso
    try {
      return await this.prisma.extendedClient.$transaction(async (tx) => {

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
        assertRolAsignableEnOrganizacion(await tx.rol.findUnique({ where: { id: data.rolId } }));

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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Este usuario ya tiene una asignación idéntica (mismo rol y sucursal) en esta organización.');
      }
      throw error;
    }
  }

  async updateAsignacion(asignacionId: string, nuevoRolId: string, sucursalId?: string | null) {
    // Verificar que la asignación existe y pertenece al tenant
    assertFound(
      await this.prisma.extendedClient.asignacionAcceso.findUnique({ where: { id: asignacionId } }),
      `Asignación con ID ${asignacionId} no encontrada`,
    );

    // Verificar que el rol existe y pertenece al tenant
    assertRolAsignableEnOrganizacion(await this.prisma.extendedClient.rol.findUnique({ where: { id: nuevoRolId } }));

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
    assertFound(
      await this.prisma.extendedClient.asignacionAcceso.findUnique({ where: { id: asignacionId } }),
      `Asignación con ID ${asignacionId} no encontrada`,
    );

    // Al eliminar la asignación, revocamos el acceso del usuario a este tenant, pero el usuario global se mantiene
    const asignacion = await this.prisma.extendedClient.asignacionAcceso.delete({
      where: { id: asignacionId },
    });

    // Invalidar caché de Redis y revocar sesión activa
    const cacheKey = `rbac:${asignacion.usuarioId}:${asignacion.organizacionId}`;
    await this.redisClient.del(cacheKey);
    // Revocar sesión activa por 7 días (TTL del JWT)
    await this.redisClient.setEx(`user:revoked:${asignacion.usuarioId}`, 604800, 'true');

    return asignacion;
  }
}
