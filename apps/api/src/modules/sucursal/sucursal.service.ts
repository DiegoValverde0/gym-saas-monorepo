import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { UpdateSucursalDto } from './dto/update-sucursal.dto';

@Injectable()
export class SucursalService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createSucursalDto: CreateSucursalDto) {
    return this.prisma.extendedClient.sucursal.create({
      // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
      data: createSucursalDto as any,
    });
  }

  async findAll() {
    return this.prisma.extendedClient.sucursal.findMany({
      orderBy: { nombre: 'asc' },
    });
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
