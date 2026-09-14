import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { CrearOrganizacionDto } from './dto/crear-organizacion.dto';
import { UpdateMiOrganizacionDto } from './dto/update-mi-organizacion.dto';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

@Injectable()
export class OrganizacionService {
  constructor(private prisma: PrismaService, private cls: ClsService) {}

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

  async getAllOrganizaciones() {
    return this.prisma.organizacion.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async crearOrganizacionConAdmin(datos: CrearOrganizacionDto): Promise<any> {
    const contrasenaHash = hashPassword(datos.contrasena);

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

        // 5. Asignar Accesos
        await tx.asignacionAcceso.create({
          data: {
            usuarioId: usuario.id,
            organizacionId: org.id,
            rolId: rolAdminGlobal.id,
            sucursalId: sucursalCentral.id,
          },
        });

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
    return this.prisma.organizacion.update({
      where: { id },
      data,
    });
  }
}
