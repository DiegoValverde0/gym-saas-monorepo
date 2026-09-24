import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReservaClaseDto } from './dto/create-reserva-clase.dto';
import { UpdateReservaClaseDto } from './dto/update-reserva-clase.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';

const INCLUDE_RESERVA = {
  clase: { select: { nombreClase: true, fechaHora: true } },
  cliente: { select: { nombre: true, numeroDocumento: true } },
} as const;

interface ClaseLockRow {
  id: string;
  estado: string;
  fechaHora: Date;
  capacidadMaxima: number;
}

@Injectable()
export class ReservaClaseService {
  constructor(private readonly prisma: PrismaService, private readonly cls: ClsService) {}

  async create(createReservaClaseDto: CreateReservaClaseDto) {
    const organizacionId = this.cls.get('organizacionId');
    if (!organizacionId) {
      throw new BadRequestException('No se puede reservar sin un tenant activo.');
    }

    return this.prisma.extendedClient.$transaction(async (tx) => {
      // SELECT ... FOR UPDATE bloquea la fila de la clase durante toda la
      // transacción, así dos reservas simultáneas para el último cupo quedan
      // serializadas (un simple count-then-create, sin este lock, permite que
      // ambas pasen la validación y se supere capacidadMaxima). Es una consulta
      // raw porque bypassa la extensión RLS/soft-delete, por eso filtramos
      // organizacionId y deletedAt a mano aquí.
      const clases = await tx.$queryRaw<ClaseLockRow[]>`
        SELECT id, estado, fecha_hora AS "fechaHora", capacidad_maxima AS "capacidadMaxima"
        FROM clases_programadas
        WHERE id = ${createReservaClaseDto.claseId}::uuid
          AND organizacion_id = ${organizacionId}::uuid
          AND deleted_at IS NULL
        FOR UPDATE
      `;
      const clase = clases[0];

      if (!clase) {
        throw new BadRequestException('La clase especificada no existe.');
      }
      if (clase.estado !== 'ACTIVO') {
        throw new BadRequestException('Esta clase fue cancelada y ya no admite reservas.');
      }
      if (clase.fechaHora <= new Date()) {
        throw new BadRequestException('No se puede reservar una clase que ya pasó.');
      }

      // ASISTIO también ocupa cupo: si no, marcar asistencia liberaba lugares
      // y permitía sobrevender la clase.
      const cuposOcupados = await tx.reservaClase.count({
        where: { claseId: createReservaClaseDto.claseId, estado: { in: ['CONFIRMADA', 'ASISTIO'] } },
      });
      if (cuposOcupados >= clase.capacidadMaxima) {
        throw new ConflictException('Esta clase ya alcanzó su capacidad máxima.');
      }

      return tx.reservaClase.create({
        // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
        data: createReservaClaseDto as unknown as Prisma.ReservaClaseUncheckedCreateInput,
        include: INCLUDE_RESERVA,
      });
    });
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.reservaClase.findMany({
        include: INCLUDE_RESERVA,
        orderBy: { fechaReserva: 'desc' },
        skip,
        take,
      }),
      this.prisma.extendedClient.reservaClase.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const reserva = await this.prisma.extendedClient.reservaClase.findUnique({
      where: { id },
      include: INCLUDE_RESERVA,
    });
    if (!reserva) {
      throw new NotFoundException(`Reserva con ID ${id} no encontrada`);
    }
    return reserva;
  }

  async update(id: string, updateReservaClaseDto: UpdateReservaClaseDto) {
    await this.findOne(id);
    return this.prisma.extendedClient.reservaClase.update({
      where: { id },
      data: updateReservaClaseDto,
    });
  }

  async cancelar(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.reservaClase.update({
      where: { id },
      data: { estado: 'CANCELADA' },
    });
  }
}
