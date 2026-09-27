import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisClientType } from 'redis';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import { CreateEmpleadoDto } from './dto/create-empleado.dto';
import { assertFound } from '../../common/utils/assert-found.util';
import { hashContrasena } from '../../common/utils/contrasena.util';
import { assertRolAsignableEnOrganizacion, assertQuedaOtroAdministrador } from '../../common/utils/rol.util';
import { assertSucursalAsignable, invalidarAccesoVigente } from '../../common/utils/acceso-vigente.util';

// El filtro de organización (prisma.service.ts) deja pasar también las
// asignaciones globales (organizacionId null), que son las del superadmin de
// plataforma. Un gimnasio no debe verlas, cambiarlas ni revocarlas.
const SOLO_DE_LA_ORGANIZACION = { organizacionId: { not: null } } satisfies Prisma.AsignacionAccesoWhereInput;

@Injectable()
export class UsuarioService {
  constructor(
      private prisma: PrismaService, 
      private cls: ClsService,
      @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType
  ) {}

  async listarUsuarios() {
    return this.prisma.extendedClient.asignacionAcceso.findMany({
      where: SOLO_DE_LA_ORGANIZACION,
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
    const sucursalId = (await assertSucursalAsignable(this.prisma, this.cls, data.sucursalId ?? undefined)) ?? this.cls.get('sucursalId');
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
            // sucursalId es opcional (sin valor = todas)
            ...(sucursalId && { sucursalId })
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
    const actual = assertFound(
      await this.prisma.extendedClient.asignacionAcceso.findFirst({ where: { id: asignacionId, ...SOLO_DE_LA_ORGANIZACION }, include: { rol: true } }),
      `Asignación con ID ${asignacionId} no encontrada`,
    );
    await assertSucursalAsignable(this.prisma, this.cls, sucursalId);

    // Verificar que el rol existe y pertenece al tenant
    assertRolAsignableEnOrganizacion(await this.prisma.extendedClient.rol.findUnique({ where: { id: nuevoRolId } }));

    const sucursalFinal = sucursalId !== undefined ? sucursalId : actual.sucursalId;
    if (sucursalFinal !== null || nuevoRolId !== actual.rolId) {
      await assertQuedaOtroAdministrador(this.prisma.extendedClient as unknown as Prisma.TransactionClient, actual);
    }

    // Actualizar la asignación (extendedClient valida que la asignación pertenece al tenant)
    const asignacion = await this.prisma.extendedClient.asignacionAcceso.update({
      where: { id: asignacionId },
      data: {
          rolId: nuevoRolId,
          sucursalId: sucursalId !== undefined ? sucursalId : undefined
      },
    });

    // Invalidar el acceso vigente cacheado: aplica en su siguiente acción, sin cerrar sesión.
    await invalidarAccesoVigente(this.redisClient, asignacion.usuarioId, asignacion.organizacionId);

    return asignacion;
  }

  async removerEmpleado(asignacionId: string) {
    const actual = assertFound(
      await this.prisma.extendedClient.asignacionAcceso.findFirst({ where: { id: asignacionId, ...SOLO_DE_LA_ORGANIZACION }, include: { rol: true } }),
      `Asignación con ID ${asignacionId} no encontrada`,
    );
    await assertQuedaOtroAdministrador(this.prisma.extendedClient as unknown as Prisma.TransactionClient, actual);

    // Al eliminar la asignación, revocamos el acceso del usuario a este tenant, pero el usuario global se mantiene
    const asignacion = await this.prisma.extendedClient.asignacionAcceso.delete({
      where: { id: asignacionId },
    });

    // Invalidar el acceso vigente cacheado: sin asignación, su siguiente
    // petición en esta organización responde 401 (JwtAuthGuard). Antes se
    // marcaba además `user:revoked`, que es global: lo dejaba fuera también
    // de los otros gimnasios donde trabaja, y 7 días aunque se le volviera a
    // dar acceso.
    await invalidarAccesoVigente(this.redisClient, asignacion.usuarioId, asignacion.organizacionId);

    return asignacion;
  }
}
