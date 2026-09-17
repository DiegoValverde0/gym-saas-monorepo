import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';

@Injectable()
export class ProductoService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createProductoDto: CreateProductoDto) {
    return await this.prisma.extendedClient.producto.create({
      // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
      data: createProductoDto as unknown as Prisma.ProductoUncheckedCreateInput,
    });
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.producto.findMany({
        orderBy: { nombre: 'asc' },
        skip,
        take,
      }),
      this.prisma.extendedClient.producto.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const producto = await this.prisma.extendedClient.producto.findUnique({
      where: { id },
    });
    if (!producto) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }
    return producto;
  }

  async update(id: string, updateProductoDto: UpdateProductoDto) {
    await this.findOne(id);
    return await this.prisma.extendedClient.producto.update({
      where: { id },
      data: updateProductoDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.producto.delete({
      where: { id },
    });
  }

  async restore(id: string) {
    // No usamos findOne porque está filtrado por deletedAt: null.
    return this.prisma.extendedClient.producto.update({
      where: { id },
      data: { deletedAt: null },
    });
  }
}
