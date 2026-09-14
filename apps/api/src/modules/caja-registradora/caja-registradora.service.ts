import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCajaRegistradoraDto } from './dto/create-caja-registradora.dto';
import { UpdateCajaRegistradoraDto } from './dto/update-caja-registradora.dto';

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
      } as any,
    });
  }

  async findAll() {
    return this.prisma.extendedClient.cajaRegistradora.findMany({
      include: {
        sucursal: true,
      },
      orderBy: { nombre: 'asc' },
    });
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
}
