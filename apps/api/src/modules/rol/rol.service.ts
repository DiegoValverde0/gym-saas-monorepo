import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';

@Injectable()
export class RolService {
  constructor(
    private prisma: PrismaService,
    private cls: ClsService,
    @Inject('REDIS_CLIENT') private readonly redisClient: any
  ) {}

  // El módulo 'organizaciones' (leer/crear/actualizar/eliminar/suspender el
  // listado global de organizaciones) nunca es asignable a un rol vía esta
  // API, para nadie -- ni siquiera para un superadmin editando roles. El
  // único rol con esos permisos es SUPERADMIN, sembrado una vez y de solo
  // lectura vía API (ver update()/remove() más abajo). Evita que un rol de
  // tenant se autoescale a visibilidad/control de plataforma.
  private async assertPermisosAsignables(permisosIds: string[] | undefined) {
    if (!permisosIds || permisosIds.length === 0) return;
    const permisos = await this.prisma.extendedClient.permiso.findMany({
      where: { id: { in: permisosIds } },
    });
    if (permisos.some((p) => p.modulo === 'organizaciones')) {
      throw new BadRequestException(
        'Los permisos del módulo "organizaciones" no se pueden asignar a un rol; son exclusivos del rol de sistema SUPERADMIN.',
      );
    }
  }

  async create(createRolDto: CreateRolDto) {
    const { permisosIds, ...rolData } = createRolDto;
    await this.assertPermisosAsignables(permisosIds);

    return this.prisma.extendedClient.$transaction(async (tx) => {
      const rol = await tx.rol.create({
        data: rolData,
      });

      if (permisosIds && permisosIds.length > 0) {
        await tx.rolPermiso.createMany({
          data: permisosIds.map((permisoId) => ({
            rolId: rol.id,
            permisoId,
          })),
        });
      }

      return rol;
    });
  }

  async findAll() {
    return this.prisma.extendedClient.rol.findMany({
      include: {
        rolPermisos: {
          include: {
            permiso: true,
          },
        },
      },
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: string) {
    const rol = await this.prisma.extendedClient.rol.findUnique({
      where: { id },
      include: {
        rolPermisos: {
          include: {
            permiso: true,
          },
        },
      },
    });
    if (!rol) {
      throw new NotFoundException(`Rol con ID ${id} no encontrado`);
    }
    return rol;
  }

  async update(id: string, updateRolDto: UpdateRolDto) {
    const { permisosIds, ...rolData } = updateRolDto;
    const existingRol = await this.findOne(id); // Validar existencia (y visibilidad) en el contexto actual

    const isSuperAdmin = this.cls.get('is_superadmin') === true;
    const isGlobalRole = existingRol.organizacionId === null;

    // Los 5 roles base (SUPERADMIN, ADMIN_GYM, ENTRENADOR, RECEPCIONISTA,
    // CLIENTE) son globales (organizacionId null) y compartidos por TODAS
    // las organizaciones: solo el superadmin de plataforma puede ajustar sus
    // permisos, porque un cambio ahí afecta a todos los tenants a la vez. Un
    // rol propio de una organización es justo lo opuesto: solo esa
    // organización lo edita -- el superadmin sigue siendo de solo lectura
    // sobre datos de tenant en el resto de la API (ver prisma.service.ts) y
    // este endpoint no es una excepción.
    if (isGlobalRole && !isSuperAdmin) {
      throw new ForbiddenException('Los roles globales del sistema solo puede modificarlos el superadministrador.');
    }
    if (!isGlobalRole && isSuperAdmin) {
      throw new ForbiddenException('El superadministrador no puede modificar roles de una organización específica.');
    }

    await this.assertPermisosAsignables(permisosIds);

    let result;
    if (isGlobalRole) {
      // Rol global: se edita con el cliente crudo de Prisma. El
      // extendedClient bloquea CUALQUIER escritura de un superadmin sobre un
      // modelo con organizacionId sin distinguir si la fila es global o de
      // un tenant (ver prisma.service.ts) -- esa distinción ya la hicimos
      // arriba con datos frescos de BD, y la repetimos dentro de la propia
      // transacción por si el rol cambiara de dueño en la carrera entre
      // ambas lecturas.
      result = await this.prisma.$transaction(async (tx) => {
        const fresh = await tx.rol.findUniqueOrThrow({ where: { id }, select: { organizacionId: true } });
        if (fresh.organizacionId !== null) {
          throw new ForbiddenException('El rol dejó de ser global durante la operación; vuelve a intentarlo.');
        }

        const rol = await tx.rol.update({ where: { id }, data: rolData });

        if (permisosIds !== undefined) {
          await tx.rolPermiso.deleteMany({ where: { rolId: id } });
          if (permisosIds.length > 0) {
            await tx.rolPermiso.createMany({
              data: permisosIds.map((permisoId) => ({ rolId: id, permisoId })),
            });
          }
        }

        return rol;
      });
    } else {
      result = await this.prisma.extendedClient.$transaction(async (tx) => {
        const rol = await tx.rol.update({ where: { id }, data: rolData });

        if (permisosIds !== undefined) {
          await tx.rolPermiso.deleteMany({ where: { rolId: id } });
          if (permisosIds.length > 0) {
            await tx.rolPermiso.createMany({
              data: permisosIds.map((permisoId) => ({ rolId: id, permisoId })),
            });
          }
        }

        return rol;
      });
    }

    // Auditoría: Invalidar caché de Redis para todos los usuarios con este
    // rol. Para un rol global usamos el cliente crudo: el cambio afecta a
    // todas las organizaciones que lo usan, sin importar cuál tenga
    // seleccionada el superadmin en este momento (ver x-tenant-id).
    if (permisosIds !== undefined) {
      const asignaciones = isGlobalRole
        ? await this.prisma.asignacionAcceso.findMany({ where: { rolId: id }, select: { usuarioId: true, organizacionId: true } })
        : await this.prisma.extendedClient.asignacionAcceso.findMany({ where: { rolId: id }, select: { usuarioId: true, organizacionId: true } });

      for (const asign of asignaciones) {
        const cacheKey = `rbac:${asign.usuarioId}:${asign.organizacionId}`;
        await this.redisClient.del(cacheKey);
      }
    }

    return result;
  }

  async remove(id: string) {
    const existingRol = await this.findOne(id);
    
    if (existingRol.esSistema) {
      throw new ForbiddenException('No se pueden eliminar los roles base del sistema.');
    }

    return this.prisma.extendedClient.rol.delete({
      where: { id },
    });
  }

  async restore(id: string) {
    // Restaurar rol haciendo null el deletedAt
    // No usamos findOne porque está filtrado por deletedAt: null
    // Ni verificamos esSistema porque si fue borrado, no era de sistema (lo prohíbe remove).
    return this.prisma.extendedClient.rol.update({
      where: { id },
      data: { deletedAt: null },
    });
  }
}
