import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { UpdateProveedorDto } from './dto/update-proveedor.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';

@Injectable()
export class ProveedorService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProveedorDto) {
    return this.prisma.extendedClient.proveedor.create({
      // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
      data: dto as unknown as Prisma.ProveedorUncheckedCreateInput,
    });
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.proveedor.findMany({ skip, take, orderBy: { nombre: 'asc' } }),
      this.prisma.extendedClient.proveedor.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const proveedor = await this.prisma.extendedClient.proveedor.findUnique({ where: { id } });
    if (!proveedor) {
      throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    }
    return proveedor;
  }

  async update(id: string, dto: UpdateProveedorDto) {
    await this.findOne(id);
    return this.prisma.extendedClient.proveedor.update({
      where: { id },
      data: dto as unknown as Prisma.ProveedorUncheckedUpdateInput,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.proveedor.delete({ where: { id } });
  }

  async restore(id: string) {
    // No usamos findOne porque está filtrado por deletedAt: null
    return this.prisma.extendedClient.proveedor.update({
      where: { id },
      data: { deletedAt: null },
    });
  }
}
