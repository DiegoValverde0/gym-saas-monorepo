import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisClientType } from 'redis';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';

@Injectable()
export class RolService {
  constructor(
    private prisma: PrismaService,
    private cls: ClsService,
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType
  ) {}

  // El módulo 'organizaciones' (leer/crear/actualizar/eliminar/suspender el
  // listado global de organizaciones) nunca se asigna vía esta API, para
  // nadie -- ni siquiera para un superadmin editando roles. Solo lo tienen
  // los roles de sistema que ya lo traen del seed (SUPERADMIN, y ADMIN_GYM
  // con organizaciones:actualizar); al editarlos se conservan tal cual (ver
  // normalizarPermisosAlEditar). Evita que un rol se autoescale a
  // visibilidad/control de plataforma.
  private async assertPermisosAsignables(permisosIds: string[] | undefined) {
    if (!permisosIds || permisosIds.length === 0) return;
    const permisos = await this.prisma.extendedClient.permiso.findMany({
      where: { id: { in: permisosIds } },
    });
    if (permisos.some((p) => p.modulo === 'organizaciones')) {
      throw new BadRequestException(
        'Los permisos del módulo "organizaciones" no se pueden asignar a un rol nuevo; son exclusivos de los roles de sistema.',
      );
    }
  }

  // Al editar un rol, los permisos de 'organizaciones' (plataforma) no se
  // agregan ni se quitan por API: se conservan los que el rol ya tiene. Así
  // SUPERADMIN (organizaciones:crear/leer/suspender) y ADMIN_GYM
  // (organizaciones:actualizar, para editar su propio gimnasio) se pueden
  // editar con normalidad -- antes el formulario reenviaba esos permisos
  // (ocultos en la UI) y assertPermisosAsignables rechazaba todo el guardado.
  //
  // Además, SUPERADMIN debe conservar roles:leer y roles:actualizar: sin
  // ellos nadie podría volver a editar los roles del sistema desde la app.
  private async normalizarPermisosAlEditar(
    rol: { nombre: string; organizacionId: string | null; rolPermisos: { permisoId: string; permiso: { modulo: string } }[] },
    permisosIds: string[] | undefined,
  ): Promise<string[] | undefined> {
    if (permisosIds === undefined) return undefined;

    const permisosPlataformaActuales = rol.rolPermisos.filter((rp) => rp.permiso.modulo === 'organizaciones').map((rp) => rp.permisoId);
    const pedidos = permisosIds.length
      ? await this.prisma.extendedClient.permiso.findMany({ where: { id: { in: permisosIds } } })
      : [];
    const pedidosPlataforma = pedidos.filter((p: { modulo: string }) => p.modulo === 'organizaciones').map((p: { id: string }) => p.id);
    if (pedidosPlataforma.some((id: string) => !permisosPlataformaActuales.includes(id))) {
      throw new BadRequestException(
        'Los permisos del módulo "organizaciones" no se pueden asignar a un rol; son exclusivos de los roles de sistema que ya los tienen.',
      );
    }
    const finales = [...new Set([...permisosIds.filter((id) => !pedidosPlataforma.includes(id)), ...permisosPlataformaActuales])];

    if (rol.organizacionId === null && rol.nombre === 'SUPERADMIN') {
      const imprescindibles = await this.prisma.extendedClient.permiso.findMany({
        where: { modulo: 'roles', accion: { in: ['leer', 'actualizar'] } },
      });
      if (imprescindibles.some((p: { id: string }) => !finales.includes(p.id))) {
        throw new BadRequestException(
          'El rol SUPERADMIN debe conservar "roles: leer" y "roles: actualizar"; sin ellos nadie podría volver a editar los roles del sistema.',
        );
      }
    }
    return finales;
  }

  async create(createRolDto: CreateRolDto) {
    const { permisosIds, ...rolData } = createRolDto;
    await this.assertPermisosAsignables(permisosIds);

    try {
      return await this.prisma.extendedClient.$transaction(async (tx) => {
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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Ya existe un rol llamado "${rolData.nombre}" en esta organización.`);
      }
      throw error;
    }
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.rol.findMany({
        include: {
          rolPermisos: {
            include: {
              permiso: true,
            },
          },
        },
        orderBy: { nombre: 'asc' },
        skip,
        take,
      }),
      this.prisma.extendedClient.rol.count(),
    ]);
    return paginar(data, total, page, limit);
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

    const permisosFinales = await this.normalizarPermisosAlEditar(existingRol, permisosIds);

    let result;
    try {
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

          if (permisosFinales !== undefined) {
            await tx.rolPermiso.deleteMany({ where: { rolId: id } });
            if (permisosFinales.length > 0) {
              await tx.rolPermiso.createMany({
                data: permisosFinales.map((permisoId) => ({ rolId: id, permisoId })),
              });
            }
          }

          return rol;
        });
      } else {
        result = await this.prisma.extendedClient.$transaction(async (tx) => {
          const rol = await tx.rol.update({ where: { id }, data: rolData });

          if (permisosFinales !== undefined) {
            await tx.rolPermiso.deleteMany({ where: { rolId: id } });
            if (permisosFinales.length > 0) {
              await tx.rolPermiso.createMany({
                data: permisosFinales.map((permisoId) => ({ rolId: id, permisoId })),
              });
            }
          }

          return rol;
        });
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un rol con ese mismo nombre en esta organización.');
      }
      throw error;
    }

    // Auditoría: Invalidar caché de Redis para todos los usuarios con este
    // rol. Para un rol global usamos el cliente crudo: el cambio afecta a
    // todas las organizaciones que lo usan, sin importar cuál tenga
    // seleccionada el superadmin en este momento (ver x-tenant-id).
    if (permisosFinales !== undefined) {
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
