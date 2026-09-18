import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateTurnoTrabajoDto } from './dto/create-turno-trabajo.dto';
import { UpdateTurnoTrabajoDto } from './dto/update-turno-trabajo.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';

const INCLUDE_TURNO = {
  staff: { include: { usuario: { select: { nombreCompleto: true } } } },
  sucursal: { select: { nombre: true } },
} as const;

@Injectable()
export class TurnoTrabajoService {
  constructor(private readonly prisma: PrismaService) {}

  // Las horas se guardan como Date (@db.Time) pero el DTO las maneja como
  // texto "HH:MM" -- mismo patrón ya usado en plan.service.ts. `fecha` llega
  // como "YYYY-MM-DD" (@IsDateString la acepta), pero Prisma exige un
  // DateTime ISO completo -- "premature end of input" si se manda tal cual.
  private normalizarHoras<T extends { fecha?: string; horaEntrada?: string; horaSalida?: string }>(data: T) {
    const result: Record<string, unknown> = { ...data };
    if (data.fecha) {
      result.fecha = new Date(`${data.fecha}T00:00:00Z`);
    }
    if (data.horaEntrada) {
      result.horaEntrada = new Date(`1970-01-01T${data.horaEntrada}:00Z`);
    }
    if (data.horaSalida) {
      result.horaSalida = new Date(`1970-01-01T${data.horaSalida}:00Z`);
    }
    return result;
  }

  async create(createTurnoTrabajoDto: CreateTurnoTrabajoDto) {
    return this.prisma.extendedClient.turnoTrabajo.create({
      // organizacionId (y sucursalId, si el usuario está atado a una) los
      // inyecta la extensión RLS en runtime (ver prisma.service.ts).
      data: this.normalizarHoras(createTurnoTrabajoDto) as unknown as Prisma.TurnoTrabajoUncheckedCreateInput,
    });
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.turnoTrabajo.findMany({
        include: INCLUDE_TURNO,
        orderBy: { fecha: 'desc' },
        skip,
        take,
      }),
      this.prisma.extendedClient.turnoTrabajo.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const turno = await this.prisma.extendedClient.turnoTrabajo.findUnique({
      where: { id },
      include: INCLUDE_TURNO,
    });
    if (!turno) {
      throw new NotFoundException(`Turno de trabajo con ID ${id} no encontrado`);
    }
    return turno;
  }

  async update(id: string, updateTurnoTrabajoDto: UpdateTurnoTrabajoDto) {
    await this.findOne(id);
    return this.prisma.extendedClient.turnoTrabajo.update({
      where: { id },
      data: this.normalizarHoras(updateTurnoTrabajoDto) as unknown as Prisma.TurnoTrabajoUncheckedUpdateInput,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.turnoTrabajo.delete({
      where: { id },
    });
  }

  async restore(id: string) {
    // No usamos findOne porque está filtrado por deletedAt: null
    return this.prisma.extendedClient.turnoTrabajo.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  // =========================================================================
  // AUTOSERVICIO: "MI TURNO DE HOY" (marcar ingreso/salida real del propio staff)
  // =========================================================================
  // A propósito NO exige el permiso 'turnos:crear/actualizar' (ver
  // turno-trabajo.controller.ts): ese permiso es para programar/editar
  // turnos AJENOS, y normalmente lo tiene el ADMIN_GYM, no cada entrenador o
  // recepcionista. Marcar el propio ingreso/salida solo requiere ser un
  // staff autenticado con un turno hoy -- si el usuario no tiene perfil de
  // staff (ej. un cliente con cuenta), esto falla igual con un 404 claro.

  private async encontrarStaffDelUsuario(usuarioId: string) {
    const staff = await this.prisma.extendedClient.perfilStaff.findUnique({ where: { usuarioId } });
    if (!staff) {
      throw new NotFoundException('Tu usuario no tiene un perfil de staff asociado.');
    }
    return staff;
  }

  private async encontrarTurnoDeHoy(usuarioId: string) {
    const staff = await this.encontrarStaffDelUsuario(usuarioId);

    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);

    const turno = await this.prisma.extendedClient.turnoTrabajo.findFirst({
      where: { staffId: staff.id, fecha: hoy },
      include: INCLUDE_TURNO,
    });
    if (!turno) {
      throw new NotFoundException('No tienes un turno programado para hoy.');
    }
    return turno;
  }

  async miTurnoDeHoy(usuarioId: string) {
    return this.encontrarTurnoDeHoy(usuarioId);
  }

  async marcarIngreso(usuarioId: string) {
    const turno = await this.encontrarTurnoDeHoy(usuarioId);
    if (turno.horaIngresoReal) {
      throw new BadRequestException('Ya marcaste tu ingreso de hoy.');
    }
    return this.prisma.extendedClient.turnoTrabajo.update({
      where: { id: turno.id },
      data: { horaIngresoReal: new Date() },
    });
  }

  async marcarSalida(usuarioId: string) {
    const turno = await this.encontrarTurnoDeHoy(usuarioId);
    if (!turno.horaIngresoReal) {
      throw new BadRequestException('Debes marcar tu ingreso antes de marcar la salida.');
    }
    if (turno.horaSalidaReal) {
      throw new BadRequestException('Ya marcaste tu salida de hoy.');
    }
    return this.prisma.extendedClient.turnoTrabajo.update({
      where: { id: turno.id },
      data: { horaSalidaReal: new Date(), estado: 'COMPLETADO' },
    });
  }
}
