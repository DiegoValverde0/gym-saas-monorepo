import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreatePromocionDto } from './dto/create-promocion.dto';
import { UpdatePromocionDto } from './dto/update-promocion.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';

@Injectable()
export class PromocionService {
  constructor(private prisma: PrismaService) {}

  // Valida el estado EFECTIVO de la promoción (ya combinado con lo existente
  // en un update parcial) -- reglas que cruzan varios campos.
  private validarReglasDeNegocio(datos: {
    fechaInicio: Date;
    fechaFin: Date;
    porcentajeDescuento?: number | null;
    montoDescuentoFijo?: number | null;
  }) {
    if (datos.fechaInicio >= datos.fechaFin) {
      throw new BadRequestException('fechaInicio debe ser anterior a fechaFin.');
    }
    if (datos.porcentajeDescuento != null && (datos.porcentajeDescuento <= 0 || datos.porcentajeDescuento > 100)) {
      throw new BadRequestException('porcentajeDescuento debe estar entre 0 (exclusivo) y 100.');
    }
    if (datos.porcentajeDescuento != null && datos.montoDescuentoFijo != null) {
      throw new BadRequestException('Define solo porcentajeDescuento o montoDescuentoFijo, no ambos.');
    }
  }

  async create(createPromocionDto: CreatePromocionDto) {
    this.validarReglasDeNegocio({
      fechaInicio: new Date(createPromocionDto.fechaInicio),
      fechaFin: new Date(createPromocionDto.fechaFin),
      porcentajeDescuento: createPromocionDto.porcentajeDescuento,
      montoDescuentoFijo: createPromocionDto.montoDescuentoFijo,
    });

    return this.prisma.extendedClient.promocion.create({
      // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
      data: createPromocionDto as unknown as Prisma.PromocionUncheckedCreateInput,
    });
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.promocion.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.extendedClient.promocion.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const promocion = await this.prisma.extendedClient.promocion.findUnique({
      where: { id },
    });
    if (!promocion) {
      throw new NotFoundException(`Promoción con ID ${id} no encontrada`);
    }
    return promocion;
  }

  async update(id: string, updatePromocionDto: UpdatePromocionDto) {
    const actual = await this.findOne(id);

    const porcentajeActual = actual.porcentajeDescuento != null ? Number(actual.porcentajeDescuento) : null;
    const montoFijoActual = actual.montoDescuentoFijo != null ? Number(actual.montoDescuentoFijo) : null;

    this.validarReglasDeNegocio({
      fechaInicio: updatePromocionDto.fechaInicio ? new Date(updatePromocionDto.fechaInicio) : actual.fechaInicio,
      fechaFin: updatePromocionDto.fechaFin ? new Date(updatePromocionDto.fechaFin) : actual.fechaFin,
      porcentajeDescuento: updatePromocionDto.porcentajeDescuento ?? porcentajeActual,
      montoDescuentoFijo: updatePromocionDto.montoDescuentoFijo ?? montoFijoActual,
    });

    return this.prisma.extendedClient.promocion.update({
      where: { id },
      data: updatePromocionDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.promocion.delete({
      where: { id },
    });
  }

  async restore(id: string) {
    // No usamos findOne porque está filtrado por deletedAt: null
    return this.prisma.extendedClient.promocion.update({
      where: { id },
      data: { deletedAt: null },
    });
  }
}
