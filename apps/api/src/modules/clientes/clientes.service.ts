import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ClientesService {
  constructor(private prisma: PrismaService) {}

  async create(createClienteDto: CreateClienteDto) {
    return this.prisma.extendedClient.cliente.create({
      data: createClienteDto,
    });
  }

  async findAll() {
    // 100% Ciego al tenant. La magia RLS de Prisma hará el filtrado
    return this.prisma.extendedClient.cliente.findMany();
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
    return this.prisma.extendedClient.cliente.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.cliente.delete({
      where: { id },
    });
  }
}
