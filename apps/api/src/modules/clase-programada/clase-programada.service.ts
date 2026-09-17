import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateClaseProgramadaDto } from './dto/create-clase-programada.dto';
import { UpdateClaseProgramadaDto } from './dto/update-clase-programada.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';

const INCLUDE_RESUMEN = {
  disciplina: { select: { nombre: true } },
  entrenador: { include: { usuario: { select: { nombreCompleto: true } } } },
  sucursal: { select: { nombre: true } },
  // Solo se listan las CONFIRMADA para calcular cupos ocupados; el frontend
  // usa reservas.length contra capacidadMaxima.
  reservas: { where: { estado: 'CONFIRMADA' as const }, select: { id: true } },
} as const;

const INCLUDE_DETALLE = {
  disciplina: true,
  entrenador: { include: { usuario: { select: { nombreCompleto: true } } } },
  sucursal: { select: { nombre: true } },
  reservas: {
    include: { cliente: { select: { nombre: true, numeroDocumento: true } } },
    orderBy: { fechaReserva: 'asc' as const },
  },
} as const;

@Injectable()
export class ClaseProgramadaService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createClaseProgramadaDto: CreateClaseProgramadaDto) {
    return this.prisma.extendedClient.claseProgramada.create({
      // organizacionId (y sucursalId, si el usuario está atado a una) los
      // inyecta la extensión RLS en runtime (ver prisma.service.ts).
      data: createClaseProgramadaDto as unknown as Prisma.ClaseProgramadaUncheckedCreateInput,
    });
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.claseProgramada.findMany({
        include: INCLUDE_RESUMEN,
        orderBy: { fechaHora: 'desc' },
        skip,
        take,
      }),
      this.prisma.extendedClient.claseProgramada.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const clase = await this.prisma.extendedClient.claseProgramada.findUnique({
      where: { id },
      include: INCLUDE_DETALLE,
    });
    if (!clase) {
      throw new NotFoundException(`Clase programada con ID ${id} no encontrada`);
    }
    return clase;
  }

  async update(id: string, updateClaseProgramadaDto: UpdateClaseProgramadaDto) {
    await this.findOne(id);
    return this.prisma.extendedClient.claseProgramada.update({
      where: { id },
      data: updateClaseProgramadaDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.claseProgramada.delete({
      where: { id },
    });
  }

  async restore(id: string) {
    // No usamos findOne porque está filtrado por deletedAt: null
    return this.prisma.extendedClient.claseProgramada.update({
      where: { id },
      data: { deletedAt: null },
    });
  }
}
