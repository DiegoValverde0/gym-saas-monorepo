import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInventarioDto } from './dto/create-inventario.dto';
import { UpdateInventarioDto } from './dto/update-inventario.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';

@Injectable()
export class InventarioService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createInventarioDto: CreateInventarioDto) {
    return await this.prisma.extendedClient.inventario.create({
      // organizacionId y sucursalId (si el usuario está atado a una) los
      // inyecta la extensión RLS en runtime (ver prisma.service.ts).
      data: createInventarioDto as unknown as Prisma.InventarioUncheckedCreateInput,
    });
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.inventario.findMany({
        include: {
          producto: true,
          sucursal: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.extendedClient.inventario.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const inventario = await this.prisma.extendedClient.inventario.findUnique({
      where: { id },
      include: {
        producto: true,
        sucursal: true,
      },
    });
    if (!inventario) {
      throw new NotFoundException(`Registro de inventario con ID ${id} no encontrado`);
    }
    return inventario;
  }

  async update(id: string, updateInventarioDto: UpdateInventarioDto) {
    await this.findOne(id);
    return await this.prisma.extendedClient.inventario.update({
      where: { id },
      data: updateInventarioDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.inventario.delete({
      where: { id },
    });
  }
}
