import { Injectable, NotFoundException } from '@nestjs/common';
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
}
