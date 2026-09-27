import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInventarioDto } from './dto/create-inventario.dto';
import { UpdateInventarioDto } from './dto/update-inventario.dto';
import { InventarioQueryDto } from './dto/inventario-query.dto';
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

  async findAll(query?: InventarioQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const termino = query?.search?.trim();
    const where: Prisma.InventarioWhereInput = {
      ...(termino && {
        OR: [
          { producto: { nombre: { contains: termino, mode: 'insensitive' } } },
          { sucursal: { nombre: { contains: termino, mode: 'insensitive' } } },
        ],
      }),
      ...(query?.sucursalId && { sucursalId: query.sucursalId }),
    };
    const [data, total, bajoStock] = await Promise.all([
      this.prisma.extendedClient.inventario.findMany({
        where,
        include: {
          producto: true,
          sucursal: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.extendedClient.inventario.count({ where }),
      // Aviso de stock bajo de toda la organización, no solo de esta página.
      this.prisma.extendedClient.inventario.count({
        where: { cantidadActual: { lte: this.prisma.extendedClient.inventario.fields.puntoReorden } },
      }),
    ]);
    return { ...paginar(data, total, page, limit), bajoStock };
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
