import { Injectable, NotFoundException, BadRequestException, ConflictException, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { RedisClientType } from 'redis';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePersonalDto } from './dto/create-personal.dto';
import { UpdatePersonalDto } from './dto/update-personal.dto';
import { CreateMiembroEquipoDto, UpdateMiembroEquipoDto } from './dto/miembro-equipo.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';
import { hashContrasena } from '../../common/utils/contrasena.util';
import { TurnoPlantillaService } from '../turno-plantilla/turno-plantilla.service';
import { assertRolAsignableEnOrganizacion } from '../../common/utils/rol.util';

// Además de SUPERADMIN (ver rol.util.ts), una persona del equipo tampoco
// puede tener el rol CLIENTE: es el de las cuentas de clientes, no de empleados.
function assertRolDeEquipo(rol: { nombre: string; organizacionId: string | null } | null) {
  assertRolAsignableEnOrganizacion(rol);
  if (rol && rol.organizacionId === null && rol.nombre === 'CLIENTE') {
    throw new BadRequestException('El rol CLIENTE no se puede asignar a una persona del equipo.');
  }
}

@Injectable()
export class PersonalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly turnoPlantillaService: TurnoPlantillaService,
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
  ) {}

  // `usuario` es una relación singular, así que la extensión RLS no filtra lo
  // que cuelga de ella: las asignaciones se filtran a mano por organización
  // (un mismo usuario puede tener acceso a varios gimnasios).
  private includeStaff() {
    return {
      usuario: {
        select: {
          nombreCompleto: true,
          correo: true,
          telefono: true,
          asignacionesAcceso: {
            where: { organizacionId: this.cls.get('organizacionId') },
            select: { id: true, rolId: true, sucursalId: true, rol: { select: { nombre: true } } },
          },
        },
      },
      staffDisciplinas: { include: { disciplina: true } },
      // Horario semanal vigente (TurnoPlantilla), un bloque por día.
      turnosPlantilla: {
        where: { activa: true },
        orderBy: { diaSemana: 'asc' as const },
        select: { diaSemana: true, horaEntrada: true, horaSalida: true, sucursalId: true },
      },
    };
  }

  async create(createPersonalDto: CreatePersonalDto) {
    const { disciplinaIds, ...staffData } = createPersonalDto;

    // El perfil de staff extiende a un usuario que ya debe tener acceso a
    // esta organización (creado antes vía el módulo de Usuarios) -- no se
    // crea un Usuario nuevo aquí.
    //
    // AsignacionAcceso.organizacionId es opcional en el schema (el superadmin
    // tiene una asignación global con organizacionId null), así que la
    // extensión RLS deja pasar también esa fila global en un findFirst (ver
    // el carve-out para campos opcionales en prisma.service.ts). Se descarta
    // explícitamente para que nadie pueda convertir al superadmin en staff
    // de un tenant.
    const asignacion = await this.prisma.extendedClient.asignacionAcceso.findFirst({
      where: { usuarioId: createPersonalDto.usuarioId },
    });
    if (!asignacion || asignacion.organizacionId === null) {
      throw new BadRequestException('El usuario debe tener una asignación de acceso en esta organización antes de crear su perfil de staff.');
    }

    return await this.prisma.extendedClient.$transaction(async (tx) => {
      const staff = await tx.perfilStaff.create({
        // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
        data: staffData as unknown as Prisma.PerfilStaffUncheckedCreateInput,
      });

      if (disciplinaIds && disciplinaIds.length > 0) {
        await tx.staffDisciplina.createMany({
          data: disciplinaIds.map((disciplinaId) => ({ staffId: staff.id, disciplinaId })) as unknown as Prisma.StaffDisciplinaCreateManyInput[],
        });
      }

      return tx.perfilStaff.findUnique({ where: { id: staff.id }, include: this.includeStaff() });
    });
  }

  // =========================================================================
  // ALTA / EDICIÓN UNIFICADA DE UN MIEMBRO DEL EQUIPO
  // =========================================================================

  async crearMiembro(dto: CreateMiembroEquipoDto) {
    const { nombreCompleto, correo, contrasena, telefono, rolId, sucursalId, disciplinaIds, horario, ...perfil } = dto;
    // Se valida el horario antes de crear nada, para no dejar a la persona
    // creada a medias si el horario está mal armado.
    if (horario) this.turnoPlantillaService.validarHorario(horario);
    const organizacionId = this.cls.get('organizacionId');
    let usuarioExistente = false;

    const staff = await this.prisma.extendedClient.$transaction(async (tx: Prisma.TransactionClient) => {
      assertRolDeEquipo(await tx.rol.findUnique({ where: { id: rolId } }));

      let usuario = await tx.usuario.findUnique({ where: { correo }, include: { perfilStaff: true } });
      let asignacion = null;
      if (usuario) {
        usuarioExistente = true;
        if (usuario.isSuperAdmin) throw new BadRequestException('Ese correo pertenece a una cuenta de plataforma.');
        if (usuario.perfilStaff) throw new ConflictException('Ya existe una persona del equipo con ese correo.');
        asignacion = await tx.asignacionAcceso.findFirst({ where: { usuarioId: usuario.id, organizacionId } });
      } else {
        usuario = await tx.usuario.create({
          data: { nombreCompleto, correo, contrasenaHash: await hashContrasena(contrasena), telefono },
          include: { perfilStaff: true },
        });
      }

      // Si la cuenta ya tenía acceso a este gimnasio (creada antes desde
      // Usuarios), se reutiliza ese acceso tal cual en vez de duplicarlo.
      if (!asignacion) {
        await tx.asignacionAcceso.create({
          data: { usuarioId: usuario.id, rolId, ...(sucursalId ? { sucursalId } : {}) } as unknown as Prisma.AsignacionAccesoUncheckedCreateInput,
        });
      }

      const creado = await tx.perfilStaff.create({
        // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
        data: { ...perfil, usuarioId: usuario.id } as unknown as Prisma.PerfilStaffUncheckedCreateInput,
      });
      if (disciplinaIds && disciplinaIds.length > 0) {
        await tx.staffDisciplina.createMany({
          data: disciplinaIds.map((disciplinaId) => ({ staffId: creado.id, disciplinaId })) as unknown as Prisma.StaffDisciplinaCreateManyInput[],
        });
      }
      return creado;
    });

    const horarioResumen = horario ? await this.turnoPlantillaService.reemplazarHorarioStaff(staff.id, horario) : null;
    return { ...(await this.findOne(staff.id)), usuarioExistente, horarioResumen };
  }

  async actualizarMiembro(id: string, dto: UpdateMiembroEquipoDto) {
    const actual = await this.findOne(id);
    const { nombreCompleto, telefono, rolId, sucursalId, horario, ...perfil } = dto;
    if (horario) this.turnoPlantillaService.validarHorario(horario);
    const organizacionId = this.cls.get('organizacionId');
    let cambioAcceso = false;

    await this.prisma.extendedClient.$transaction(async (tx: Prisma.TransactionClient) => {
      if (nombreCompleto !== undefined || telefono !== undefined) {
        await tx.usuario.update({ where: { id: actual.usuarioId }, data: { nombreCompleto, telefono } });
      }

      if (rolId !== undefined || sucursalId !== undefined) {
        if (rolId) assertRolDeEquipo(await tx.rol.findUnique({ where: { id: rolId } }));
        const asignacion = await tx.asignacionAcceso.findFirst({ where: { usuarioId: actual.usuarioId, organizacionId } });
        if (!asignacion) throw new BadRequestException('Esta persona no tiene acceso a la organización.');
        await tx.asignacionAcceso.update({
          where: { id: asignacion.id },
          data: { ...(rolId ? { rolId } : {}), ...(sucursalId !== undefined ? { sucursalId } : {}) },
        });
        cambioAcceso = true;
      }
    });

    // Perfil y disciplinas: misma lógica que el PATCH clásico.
    if (Object.keys(perfil).length > 0) await this.update(id, perfil);

    // Mismo motivo que UsuarioService.updateAsignacion: los permisos se cachean en Redis.
    if (cambioAcceso) await this.redisClient.del(`rbac:${actual.usuarioId}:${organizacionId}`);

    const horarioResumen = horario ? await this.turnoPlantillaService.reemplazarHorarioStaff(id, horario) : null;
    return { ...(await this.findOne(id)), horarioResumen };
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.perfilStaff.findMany({
        include: this.includeStaff(),
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.extendedClient.perfilStaff.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const staff = await this.prisma.extendedClient.perfilStaff.findUnique({
      where: { id },
      include: this.includeStaff(),
    });
    if (!staff) {
      throw new NotFoundException(`Perfil de staff con ID ${id} no encontrado`);
    }
    return staff;
  }

  async update(id: string, updatePersonalDto: UpdatePersonalDto) {
    await this.findOne(id);
    const { disciplinaIds, ...staffData } = updatePersonalDto;
    // usuarioId se ignora a propósito: el perfil queda ligado al mismo
    // usuario para siempre, no se "reasigna" a otra persona.
    delete (staffData as { usuarioId?: string }).usuarioId;

    return this.prisma.extendedClient.$transaction(async (tx) => {
      await tx.perfilStaff.update({ where: { id }, data: staffData });

      if (disciplinaIds !== undefined) {
        await tx.staffDisciplina.deleteMany({ where: { staffId: id } });
        if (disciplinaIds.length > 0) {
          await tx.staffDisciplina.createMany({
            data: disciplinaIds.map((disciplinaId) => ({ staffId: id, disciplinaId })) as unknown as Prisma.StaffDisciplinaCreateManyInput[],
          });
        }
      }

      return tx.perfilStaff.findUnique({ where: { id }, include: this.includeStaff() });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.perfilStaff.delete({
      where: { id },
    });
  }

  async restore(id: string) {
    // No usamos findOne porque está filtrado por deletedAt: null
    return this.prisma.extendedClient.perfilStaff.update({
      where: { id },
      data: { deletedAt: null },
    });
  }
}
