import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';

@Injectable()
export class ClientesService {
  constructor(private prisma: PrismaService) {}

  async create(createClienteDto: CreateClienteDto) {
    try {
      return await this.prisma.extendedClient.cliente.create({
        // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
        data: createClienteDto as any,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Ya existe un cliente registrado con ese mismo número de carnet/documento en esta sucursal u organización.');
        }
      }
      throw error;
    }
  }

  async findAll(query?: PaginationQueryDto) {
    // 100% Ciego al tenant. La magia RLS de Prisma hará el filtrado.
    // Paginado para no traer de golpe toda la tabla de un tenant con miles de clientes.
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.cliente.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.extendedClient.cliente.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const cliente = await this.prisma.extendedClient.cliente.findUnique({
      where: { id },
    });
    if (!cliente) {
      throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    }
    return cliente;
  }

  async update(id: string, updateData: Prisma.ClienteUpdateInput) {
    // Primero verificamos si existe (y si pertenece al tenant gracias a RLS implícito)
    await this.findOne(id);
    try {
      return await this.prisma.extendedClient.cliente.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Ya existe un cliente registrado con ese mismo número de carnet/documento en esta sucursal u organización.');
        }
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.cliente.delete({
      where: { id },
    });
  }

  async restore(id: string) {
    // No usamos findOne porque está filtrado por deletedAt: null
    return this.prisma.extendedClient.cliente.update({
      where: { id },
      data: { deletedAt: null },
    });
  }
}
