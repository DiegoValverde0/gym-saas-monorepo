import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { UpdateSucursalDto } from './dto/update-sucursal.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';

@Injectable()
export class SucursalService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createSucursalDto: CreateSucursalDto) {
    return this.prisma.extendedClient.sucursal.create({
      // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
      data: createSucursalDto as unknown as Prisma.SucursalUncheckedCreateInput,
    });
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.sucursal.findMany({
        orderBy: { nombre: 'asc' },
        skip,
        take,
      }),
      this.prisma.extendedClient.sucursal.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const sucursal = await this.prisma.extendedClient.sucursal.findUnique({
      where: { id },
    });
    if (!sucursal) {
      throw new NotFoundException(`Sucursal con ID ${id} no encontrada en esta organización`);
    }
    return sucursal;
  }

  async update(id: string, updateSucursalDto: UpdateSucursalDto) {
    // Validar existencia en el tenant antes de actualizar
    await this.findOne(id);

    return this.prisma.extendedClient.sucursal.update({
      where: { id },
      data: updateSucursalDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.sucursal.delete({
      where: { id },
    });
  }

  async restore(id: string) {
    // Restaurar el registro haciendo null el deletedAt
    // No usamos findOne porque está filtrado por deletedAt: null
    return this.prisma.extendedClient.sucursal.update({
      where: { id },
      data: { deletedAt: null },
    });
  }
}
