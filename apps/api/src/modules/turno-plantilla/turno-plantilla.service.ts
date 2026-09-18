import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTurnoPlantillaDto } from './dto/create-turno-plantilla.dto';
import { UpdateTurnoPlantillaDto } from './dto/update-turno-plantilla.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';

// Cuántas semanas hacia adelante se mantiene "poblada" la agenda de turnos
// a partir de las plantillas activas.
const SEMANAS_PROYECCION_DEFAULT = 8;

const INCLUDE_PLANTILLA = {
  staff: { include: { usuario: { select: { nombreCompleto: true } } } },
  sucursal: { select: { nombre: true } },
} as const;

@Injectable()
export class TurnoPlantillaService {
  private readonly logger = new Logger(TurnoPlantillaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  // Igual patrón que turno-trabajo.service.ts: las horas llegan como "HH:MM"
  // pero Prisma exige un DateTime ISO completo para @db.Time.
  private normalizarHoras<T extends { vigenciaDesde?: string; vigenciaHasta?: string; horaEntrada?: string; horaSalida?: string }>(
    data: T,
  ) {
    const result: Record<string, unknown> = { ...data };
    if (data.vigenciaDesde) result.vigenciaDesde = new Date(`${data.vigenciaDesde}T00:00:00Z`);
    if (data.vigenciaHasta) result.vigenciaHasta = new Date(`${data.vigenciaHasta}T00:00:00Z`);
    if (data.horaEntrada) result.horaEntrada = new Date(`1970-01-01T${data.horaEntrada}:00Z`);
    if (data.horaSalida) result.horaSalida = new Date(`1970-01-01T${data.horaSalida}:00Z`);
    return result;
  }

  async create(dto: CreateTurnoPlantillaDto) {
    return this.prisma.extendedClient.turnoPlantilla.create({
      // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
      data: this.normalizarHoras(dto) as unknown as Prisma.TurnoPlantillaUncheckedCreateInput,
    });
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.turnoPlantilla.findMany({
        include: INCLUDE_PLANTILLA,
        orderBy: [{ diaSemana: 'asc' }, { horaEntrada: 'asc' }],
        skip,
        take,
      }),
      this.prisma.extendedClient.turnoPlantilla.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const plantilla = await this.prisma.extendedClient.turnoPlantilla.findUnique({
      where: { id },
      include: INCLUDE_PLANTILLA,
    });
    if (!plantilla) {
      throw new NotFoundException(`Plantilla de turno con ID ${id} no encontrada`);
    }
    return plantilla;
  }

  async update(id: string, dto: UpdateTurnoPlantillaDto) {
    await this.findOne(id);
    return this.prisma.extendedClient.turnoPlantilla.update({
      where: { id },
      data: this.normalizarHoras(dto) as unknown as Prisma.TurnoPlantillaUncheckedUpdateInput,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.turnoPlantilla.delete({
      where: { id },
    });
  }

  async restore(id: string) {
    return this.prisma.extendedClient.turnoPlantilla.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  // Disparado manualmente desde el frontend ("Generar turnos ahora"), con el
  // contexto de tenant de la request ya resuelto en el CLS.
  async generarAhora(semanas: number = SEMANAS_PROYECCION_DEFAULT) {
    const organizacionId = this.cls.get('organizacionId');
    if (!organizacionId) return { turnosCreados: 0 };
    return this.generarParaOrganizacion(organizacionId, semanas);
  }

  // Núcleo de la proyección: materializa filas de TurnoTrabajo a partir de
  // las TurnoPlantilla activas, para los próximos `semanas` a partir de hoy.
  // Usa `this.prisma` crudo (no extendedClient) a propósito: se llama tanto
  // desde el cron (sin contexto de tenant en el CLS, ver membresia.service.ts
  // para el mismo patrón) como desde `generarAhora`, y en ambos casos
  // necesitamos fijar `organizacionId` explícitamente en cada fila creada.
  async generarParaOrganizacion(organizacionId: string, semanas: number = SEMANAS_PROYECCION_DEFAULT) {
    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);
    const finVentana = new Date(hoy);
    finVentana.setUTCDate(finVentana.getUTCDate() + semanas * 7);

    const plantillas = await this.prisma.turnoPlantilla.findMany({
      where: {
        organizacionId,
        activa: true,
        deletedAt: null,
        vigenciaDesde: { lte: finVentana },
        OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: hoy } }],
      },
    });
    if (plantillas.length === 0) return { turnosCreados: 0 };

    const staffIds = [...new Set(plantillas.map((p) => p.staffId))];
    const turnosExistentes = await this.prisma.turnoTrabajo.findMany({
      where: {
        organizacionId,
        staffId: { in: staffIds },
        fecha: { gte: hoy, lte: finVentana },
        deletedAt: null,
      },
      select: { staffId: true, fecha: true },
    });
    const existentes = new Set(turnosExistentes.map((t) => `${t.staffId}|${t.fecha.toISOString().slice(0, 10)}`));

    const nuevos: Prisma.TurnoTrabajoCreateManyInput[] = [];
    for (const plantilla of plantillas) {
      const desde = plantilla.vigenciaDesde > hoy ? plantilla.vigenciaDesde : hoy;
      const hasta = plantilla.vigenciaHasta && plantilla.vigenciaHasta < finVentana ? plantilla.vigenciaHasta : finVentana;

      for (const fecha = new Date(desde); fecha <= hasta; fecha.setUTCDate(fecha.getUTCDate() + 1)) {
        if (fecha.getUTCDay() !== plantilla.diaSemana) continue;
        const clave = `${plantilla.staffId}|${fecha.toISOString().slice(0, 10)}`;
        if (existentes.has(clave)) continue;
        existentes.add(clave); // dos plantillas del mismo staff no duplican el mismo día
        nuevos.push({
          organizacionId,
          staffId: plantilla.staffId,
          sucursalId: plantilla.sucursalId,
          fecha: new Date(fecha),
          horaEntrada: plantilla.horaEntrada,
          horaSalida: plantilla.horaSalida,
        });
      }
    }

    if (nuevos.length === 0) return { turnosCreados: 0 };
    await this.prisma.turnoTrabajo.createMany({ data: nuevos });
    return { turnosCreados: nuevos.length };
  }

  // Mantiene la agenda poblada para todas las organizaciones activas, sin
  // que nadie tenga que acordarse de apretar "Generar turnos ahora".
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleGeneracionDiaria() {
    this.logger.log('Generando turnos proyectados desde plantillas activas...');
    const organizaciones = await this.prisma.organizacion.findMany({
      where: { deletedAt: null, estado: 'ACTIVO' },
      select: { id: true },
    });

    for (const org of organizaciones) {
      try {
        const { turnosCreados } = await this.generarParaOrganizacion(org.id);
        if (turnosCreados > 0) {
          this.logger.log(`Organización ${org.id}: ${turnosCreados} turnos generados desde plantillas.`);
        }
      } catch (err) {
        this.logger.error(`Fallo generando turnos para organización ${org.id}: ${(err as Error).message}`);
      }
    }
  }
}
