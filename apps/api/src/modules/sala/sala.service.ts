import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSalaDto, SalasQueryDto, UpdateSalaDto } from './dto/sala.dto';

/**
 * Salas de cada sucursal (fase 6, DB-2). Sirven para que dos clases no usen la
 * misma sala a la misma hora (ver choques-clase.util.ts). Son opcionales: una
 * sucursal sin salas funciona igual que antes.
 */
@Injectable()
export class SalaService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(q: SalasQueryDto) {
    return this.prisma.extendedClient.sala.findMany({
      where: q.sucursalId ? { sucursalId: q.sucursalId } : {},
      orderBy: [{ sucursalId: 'asc' }, { nombre: 'asc' }],
      include: { _count: { select: { clasesPlantilla: { where: { activa: true, deletedAt: null } } } } },
    });
  }

  private async assertNombreLibre(sucursalId: string, nombre: string, excluirId?: string) {
    const repetida = await this.prisma.extendedClient.sala.findFirst({
      where: { sucursalId, nombre: { equals: nombre.trim(), mode: 'insensitive' }, ...(excluirId ? { id: { not: excluirId } } : {}) },
      select: { id: true },
    });
    if (repetida) throw new ConflictException(`Ya hay una sala llamada "${nombre.trim()}" en esta sucursal.`);
  }

  async create(dto: CreateSalaDto) {
    const sucursal = await this.prisma.extendedClient.sucursal.findUnique({ where: { id: dto.sucursalId }, select: { id: true } });
    if (!sucursal) throw new BadRequestException('La sucursal no existe.');
    await this.assertNombreLibre(dto.sucursalId, dto.nombre);
    return this.prisma.extendedClient.sala.create({
      // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
      data: { sucursalId: dto.sucursalId, nombre: dto.nombre.trim(), capacidad: dto.capacidad ?? null } as unknown as Prisma.SalaUncheckedCreateInput,
    });
  }

  private async findOne(id: string) {
    const sala = await this.prisma.extendedClient.sala.findUnique({ where: { id } });
    if (!sala) throw new NotFoundException('La sala no existe.');
    return sala;
  }

  async update(id: string, dto: UpdateSalaDto) {
    const sala = await this.findOne(id);
    if (dto.nombre) await this.assertNombreLibre(sala.sucursalId, dto.nombre, id);
    return this.prisma.extendedClient.sala.update({
      where: { id },
      data: { ...(dto.nombre ? { nombre: dto.nombre.trim() } : {}), ...(dto.capacidad !== undefined ? { capacidad: dto.capacidad } : {}) },
    });
  }

  // Quitar una sala: sus clases y las sesiones futuras quedan "sin sala" (no
  // se borra ninguna clase). Las sesiones pasadas conservan el dato.
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.$transaction(async (tx: Prisma.TransactionClient) => {
      const clases = await tx.clasePlantilla.updateMany({ where: { salaId: id }, data: { salaId: null } });
      const sesiones = await tx.claseProgramada.updateMany({ where: { salaId: id, fechaHora: { gt: new Date() } }, data: { salaId: null } });
      await tx.sala.delete({ where: { id } }); // soft delete vía extensión
      return { clasesSinSala: clases.count, sesionesSinSala: sesiones.count };
    });
  }
}
