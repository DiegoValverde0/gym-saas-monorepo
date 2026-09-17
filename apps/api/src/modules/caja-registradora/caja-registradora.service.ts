import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateCajaRegistradoraDto } from './dto/create-caja-registradora.dto';
import { UpdateCajaRegistradoraDto } from './dto/update-caja-registradora.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';

@Injectable()
export class CajaRegistradoraService {
  constructor(private prisma: PrismaService) {}

  async create(createCajaRegistradoraDto: CreateCajaRegistradoraDto, usuarioId: string) {
    return this.prisma.extendedClient.cajaRegistradora.create({
      // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts);
      // el tipo estático de Prisma no lo sabe, de ahí el cast puntual.
      data: {
        ...createCajaRegistradoraDto,
        creadoPorId: usuarioId, // Firma de auditoría
      } as unknown as Prisma.CajaRegistradoraUncheckedCreateInput,
    });
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.cajaRegistradora.findMany({
        include: {
          sucursal: true,
        },
        orderBy: { nombre: 'asc' },
        skip,
        take,
      }),
      this.prisma.extendedClient.cajaRegistradora.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const caja = await this.prisma.extendedClient.cajaRegistradora.findUnique({
      where: { id },
      include: {
        sucursal: true,
      },
    });
    if (!caja) {
      throw new NotFoundException(`Caja registradora con ID ${id} no encontrada`);
    }
    return caja;
  }

  async update(id: string, updateCajaRegistradoraDto: UpdateCajaRegistradoraDto) {
    await this.findOne(id);
    return this.prisma.extendedClient.cajaRegistradora.update({
      where: { id },
      data: updateCajaRegistradoraDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.cajaRegistradora.delete({
      where: { id },
    });
  }

  async restore(id: string) {
    // No usamos findOne porque está filtrado por deletedAt: null
    return this.prisma.extendedClient.cajaRegistradora.update({
      where: { id },
      data: { deletedAt: null },
    });
  }
}
