import { Injectable, ConflictException, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { RedisClientType } from 'redis';
import { invalidarAccesoVigente } from '../../common/utils/acceso-vigente.util';
import { ROL_ADMINISTRADOR } from '../../common/utils/rol.util';
import { promisify } from 'util';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { CrearOrganizacionDto } from './dto/crear-organizacion.dto';
import { UpdateMiOrganizacionDto } from './dto/update-mi-organizacion.dto';

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const scryptAsync = promisify(crypto.scrypt);
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

@Injectable()
export class OrganizacionService {
  constructor(
    private prisma: PrismaService,
    private cls: ClsService,
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
  ) {}

  // ==============================================================
  // METODOS DE PLATAFORMA PARA SUPERADMIN
  //
  // Organizacion no tiene campo `organizacionId`, así que estas consultas
  // nunca pasan por el filtro de tenant de PrismaService.extendedClient (ni
  // falta que hace: el superadmin necesita verlas/crearlas todas). El
  // superadmin NUNCA edita ni borra datos internos de un tenant -- sus únicas
  // escrituras aquí son crear una organización nueva (con su propio admin) y
  // suspender/reactivar una existente (solo el campo `estado`).
  // ==============================================================

  // Incluye el diagnóstico de acceso (plan 6.6 e): sus administradores con su
  // alcance, y si ninguno tiene acceso a todas las sucursales (como le pasó a
  // Gym Diego). Solo lectura.
  async getAllOrganizaciones() {
    const organizaciones = await this.prisma.organizacion.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        asignacionesAcceso: {
          where: { rol: { nombre: ROL_ADMINISTRADOR, organizacionId: null }, usuario: { deletedAt: null } },
          select: {
            id: true,
            sucursalId: true,
            sucursal: { select: { nombre: true } },
            usuario: { select: { nombreCompleto: true, correo: true } },
          },
        },
      },
    });
    return organizaciones.map(({ asignacionesAcceso, ...org }) => ({
      ...org,
      administradores: asignacionesAcceso.map((a) => ({
        asignacionId: a.id,
        nombre: a.usuario.nombreCompleto,
        correo: a.usuario.correo,
        sucursalNombre: a.sucursalId ? a.sucursal?.nombre ?? 'Una sucursal' : null,
      })),
      sinAdministradorGeneral: !asignacionesAcceso.some((a) => a.sucursalId === null),
    }));
  }

  // Acción de plataforma acotada (plan 6.6 e): da acceso a todas las
  // sucursales a un ADMINISTRADOR de la organización. Es la única escritura
  // del superadmin sobre el acceso de un gimnasio, igual que el alta de la
  // organización con su administrador, y queda registrada en Auditoria.
  async darAccesoTotalAdministrador(organizacionId: string, asignacionId: string, autorId: string, ip?: string) {
    await this.assertOrganizacionExiste(organizacionId);
    const asignacion = await this.prisma.asignacionAcceso.findFirst({
      where: { id: asignacionId, organizacionId, rol: { nombre: ROL_ADMINISTRADOR, organizacionId: null } },
    });
    if (!asignacion) throw new NotFoundException('Ese administrador no pertenece a esta organización.');
    if (asignacion.sucursalId === null) return { ok: true, sinCambios: true };

    await this.prisma.$transaction([
      this.prisma.asignacionAcceso.update({ where: { id: asignacionId }, data: { sucursalId: null } }),
      this.prisma.auditoria.create({
        data: {
          organizacionId,
          usuarioId: autorId,
          tablaAfectada: 'asignaciones_acceso',
          operacion: 'UPDATE',
          valoresAnteriores: { asignacionId, sucursalId: asignacion.sucursalId },
          valoresNuevos: { asignacionId, sucursalId: null, accion: 'plataforma_acceso_total_administrador' },
          ipOrigen: ip?.slice(0, 45),
        },
      }),
    ]);
    await invalidarAccesoVigente(this.redisClient, asignacion.usuarioId, organizacionId);
    return { ok: true };
  }

  async crearOrganizacionConAdmin(datos: CrearOrganizacionDto) {
    const contrasenaHash = await hashPassword(datos.contrasena);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Buscar rol global ADMIN_GYM
        const rolAdminGlobal = await tx.rol.findFirst({
          where: { nombre: 'ADMIN_GYM', organizacionId: null },
        });
        if (!rolAdminGlobal) {
          throw new BadRequestException('El rol global ADMIN_GYM no existe en el sistema. Ejecuta el seed.');
        }

        // 2. Crear Organización
        const org = await tx.organizacion.create({
          data: {
            nombre: datos.nombreOrg,
            estado: 'ACTIVO',
          },
        });

        // 3. Crear Sucursal Central por Defecto
        const sucursalCentral = await tx.sucursal.create({
          data: {
            organizacionId: org.id,
            nombre: 'Sede Central',
            esPrincipal: true,
            estado: 'ACTIVO',
            direccion: 'Sin dirección',
          },
        });

        // 4. Crear Usuario Administrador
        const usuario = await tx.usuario.create({
          data: {
            nombreCompleto: datos.nombreAdmin,
            correo: datos.correo,
            contrasenaHash,
          },
        });

        // 5. Asignar Accesos: el dueño nace con acceso a TODAS las sucursales
        // (sucursalId null). Antes quedaba limitado a la sede inicial y no
        // veía las sucursales que creara después (ver plan de simplificación,
        // 13.12, y el script db:corregir-acceso-administradores).
        await tx.asignacionAcceso.create({
          data: {
            usuarioId: usuario.id,
            organizacionId: org.id,
            rolId: rolAdminGlobal.id,
            sucursalId: null,
          },
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { contrasenaHash: _, ...usuarioSinContrasena } = usuario;
        return { organizacion: org, sucursal: sucursalCentral, admin: usuarioSinContrasena };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un usuario registrado con ese correo.');
      }
      throw error;
    }
  }

  async suspenderOrganizacion(id: string) {
    await this.assertOrganizacionExiste(id);
    return this.prisma.organizacion.update({
      where: { id },
      data: { estado: 'SUSPENDIDO', deletedAt: new Date() },
    });
  }

  async reactivarOrganizacion(id: string) {
    await this.assertOrganizacionExiste(id);
    return this.prisma.organizacion.update({
      where: { id },
      data: { estado: 'ACTIVO', deletedAt: null },
    });
  }

  private async assertOrganizacionExiste(id: string) {
    const org = await this.prisma.organizacion.findUnique({ where: { id } });
    if (!org) throw new NotFoundException('Organización no encontrada');
    return org;
  }

  // ==============================================================
  // METODOS PARA EL TENANT (Dueño del Gym) -- solo su propia organización,
  // acotada siempre por el organizacionId del contexto (CLS), nunca por un
  // id que mande el cliente.
  // ==============================================================

  async getMiOrganizacion() {
    const id = this.cls.get('organizacionId');
    if (!id) throw new BadRequestException('Contexto de organización no encontrado');
    const org = await this.prisma.organizacion.findUnique({
      where: { id },
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    return org;
  }

  async updateMiOrganizacion(data: UpdateMiOrganizacionDto) {
    const id = this.cls.get('organizacionId');
    if (!id) throw new BadRequestException('Contexto de organización no encontrado');
    const { configuracion, ...rest } = data;
    return this.prisma.organizacion.update({
      where: { id },
      data: {
        ...rest,
        ...(configuracion !== undefined && { configuracion: configuracion as Prisma.InputJsonValue }),
      },
    });
  }
}
