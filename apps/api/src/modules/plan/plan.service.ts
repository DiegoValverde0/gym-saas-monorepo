import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';

@Injectable()
export class PlanService {
  constructor(private prisma: PrismaService) {}

  // Valida el estado EFECTIVO del plan (ya combinado con lo existente en un
  // update parcial) -- reglas que class-validator no puede expresar por sí
  // solo porque cruzan varios campos.
  private validarReglasDeNegocio(datos: {
    tipoPlan?: string;
    duracionDias?: number | null;
    cantidadSesiones?: number | null;
    horaInicioAcceso?: string | null;
    horaFinAcceso?: string | null;
    diasPermitidos?: number[] | null;
  }) {
    if (datos.tipoPlan === 'TIEMPO' && !datos.duracionDias) {
      throw new BadRequestException('Un plan de tipo TIEMPO requiere duracionDias mayor a 0.');
    }
    if (datos.tipoPlan === 'SESIONES' && !datos.cantidadSesiones) {
      throw new BadRequestException('Un plan de tipo SESIONES requiere cantidadSesiones mayor a 0.');
    }
    if (datos.horaInicioAcceso && datos.horaFinAcceso && datos.horaInicioAcceso >= datos.horaFinAcceso) {
      throw new BadRequestException('horaInicioAcceso debe ser anterior a horaFinAcceso.');
    }
    if (datos.diasPermitidos?.some((d) => d < 0 || d > 6)) {
      throw new BadRequestException('diasPermitidos solo admite valores entre 0 (domingo) y 6 (sábado).');
    }
  }

  // Las horas se guardan como Date (@db.Time) pero las reglas de negocio y el
  // DTO las manejan como texto "HH:MM" -- este helper hace la vuelta inversa
  // para poder validar el estado combinado en update().
  private horaComoTexto(hora: Date | null): string | null {
    if (!hora) return null;
    return `${hora.getUTCHours().toString().padStart(2, '0')}:${hora.getUTCMinutes().toString().padStart(2, '0')}`;
  }

  async create(createPlanDto: CreatePlanDto) {
    this.validarReglasDeNegocio(createPlanDto);

    const data: any = { ...createPlanDto };

    // Convertir horas a objetos Date falsos solo para la hora, Prisma espera ISO string si es DateTime? @db.Time
    if (data.horaInicioAcceso) {
      data.horaInicioAcceso = new Date(`1970-01-01T${data.horaInicioAcceso}:00Z`);
    }
    if (data.horaFinAcceso) {
      data.horaFinAcceso = new Date(`1970-01-01T${data.horaFinAcceso}:00Z`);
    }

    return this.prisma.extendedClient.plan.create({
      data,
    });
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.plan.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.extendedClient.plan.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const plan = await this.prisma.extendedClient.plan.findUnique({
      where: { id },
    });
    if (!plan) {
      throw new NotFoundException(`Plan con ID ${id} no encontrado`);
    }
    return plan;
  }

  async update(id: string, updatePlanDto: UpdatePlanDto) {
    const planActual = await this.findOne(id);

    // Validamos el estado EFECTIVO resultante (existente + parche), no solo
    // los campos que llegan en este PATCH -- si solo mandan duracionDias,
    // igual hay que saber si tipoPlan sigue siendo TIEMPO.
    this.validarReglasDeNegocio({
      tipoPlan: updatePlanDto.tipoPlan ?? planActual.tipoPlan,
      duracionDias: updatePlanDto.duracionDias ?? planActual.duracionDias,
      cantidadSesiones: updatePlanDto.cantidadSesiones ?? planActual.cantidadSesiones,
      horaInicioAcceso: updatePlanDto.horaInicioAcceso ?? this.horaComoTexto(planActual.horaInicioAcceso),
      horaFinAcceso: updatePlanDto.horaFinAcceso ?? this.horaComoTexto(planActual.horaFinAcceso),
      diasPermitidos: updatePlanDto.diasPermitidos ?? planActual.diasPermitidos,
    });

    const data: any = { ...updatePlanDto };

    if (data.horaInicioAcceso) {
      data.horaInicioAcceso = new Date(`1970-01-01T${data.horaInicioAcceso}:00Z`);
    }
    if (data.horaFinAcceso) {
      data.horaFinAcceso = new Date(`1970-01-01T${data.horaFinAcceso}:00Z`);
    }

    return this.prisma.extendedClient.plan.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.plan.delete({
      where: { id },
    });
  }
}
