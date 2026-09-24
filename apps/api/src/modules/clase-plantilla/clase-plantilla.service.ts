import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClasePlantillaDto } from './dto/create-clase-plantilla.dto';
import { UpdateClasePlantillaDto } from './dto/update-clase-plantilla.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';
import { aHoraLocal, desdeHoraLocal } from '../../common/utils/zona-horaria.util';

// Cuántas semanas hacia adelante se mantiene "poblada" la agenda de clases a
// partir de las plantillas activas (mismo default que turno-plantilla.service.ts).
const SEMANAS_PROYECCION_DEFAULT = 8;

const INCLUDE_PLANTILLA = {
  disciplina: { select: { nombre: true } },
  entrenador: { include: { usuario: { select: { nombreCompleto: true } } } },
  sucursal: { select: { nombre: true } },
} as const;

@Injectable()
export class ClasePlantillaService {
  private readonly logger = new Logger(ClasePlantillaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  // Igual patrón que turno-plantilla.service.ts: las horas/fechas llegan como
  // texto pero Prisma exige DateTime completo para @db.Time/@db.Date.
  private normalizarHoras<T extends { vigenciaDesde?: string; vigenciaHasta?: string; horaInicio?: string }>(data: T) {
    const result: Record<string, unknown> = { ...data };
    if (data.vigenciaDesde) result.vigenciaDesde = new Date(`${data.vigenciaDesde}T00:00:00Z`);
    if (data.vigenciaHasta) result.vigenciaHasta = new Date(`${data.vigenciaHasta}T00:00:00Z`);
    if (data.horaInicio) result.horaInicio = new Date(`1970-01-01T${data.horaInicio}:00Z`);
    return result;
  }

  async create(dto: CreateClasePlantillaDto) {
    return this.prisma.extendedClient.clasePlantilla.create({
      // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
      data: this.normalizarHoras(dto) as unknown as Prisma.ClasePlantillaUncheckedCreateInput,
    });
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.clasePlantilla.findMany({
        include: INCLUDE_PLANTILLA,
        orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
        skip,
        take,
      }),
      this.prisma.extendedClient.clasePlantilla.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const plantilla = await this.prisma.extendedClient.clasePlantilla.findUnique({
      where: { id },
      include: INCLUDE_PLANTILLA,
    });
    if (!plantilla) {
      throw new NotFoundException(`Plantilla de clase con ID ${id} no encontrada`);
    }
    return plantilla;
  }

  async update(id: string, dto: UpdateClasePlantillaDto) {
    await this.findOne(id);
    return this.prisma.extendedClient.clasePlantilla.update({
      where: { id },
      data: this.normalizarHoras(dto) as unknown as Prisma.ClasePlantillaUncheckedUpdateInput,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.clasePlantilla.delete({
      where: { id },
    });
  }

  async restore(id: string) {
    return this.prisma.extendedClient.clasePlantilla.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  // Disparado manualmente desde el frontend ("Generar clases ahora"), con el
  // contexto de tenant de la request ya resuelto en el CLS.
  async generarAhora(semanas: number = SEMANAS_PROYECCION_DEFAULT) {
    const organizacionId = this.cls.get('organizacionId');
    if (!organizacionId) return { clasesCreadas: 0, clasesOmitidas: 0 };
    return this.generarParaOrganizacion(organizacionId, semanas);
  }

  // Busca, entre los turnos de trabajo del entrenador en esa sucursal y
  // fecha, uno que cubra por completo el horario propuesto. Réplica de
  // ClaseProgramadaService.resolverTurnoParaClase, pero sobre `this.prisma`
  // crudo (ver justificación de generarParaOrganizacion más abajo) en vez de
  // extendedClient -- no vale la pena acoplar los dos servicios solo para
  // compartir este bloque de ~10 líneas con clientes de Prisma distintos.
  private async buscarTurnoQueCubre(
    entrenadorId: string,
    sucursalId: string,
    fecha: Date,
    horaInicio: Date,
    duracionMinutos: number,
  ): Promise<string | null> {
    const turnos = await this.prisma.turnoTrabajo.findMany({
      // Igual que en ClaseProgramadaService: un turno ausente o cancelado es
      // una excepción puntual y no cubre la clase.
      where: { staffId: entrenadorId, sucursalId, fecha, estado: { notIn: ['AUSENTE', 'CANCELADO'] } },
    });

    const minutosInicioClase = horaInicio.getUTCHours() * 60 + horaInicio.getUTCMinutes();
    const minutosFinClase = minutosInicioClase + duracionMinutos;

    const turnoQueCubre = turnos.find((turno) => {
      const minutosInicioTurno = turno.horaEntrada.getUTCHours() * 60 + turno.horaEntrada.getUTCMinutes();
      const minutosFinTurno = turno.horaSalida.getUTCHours() * 60 + turno.horaSalida.getUTCMinutes();
      return minutosInicioTurno <= minutosInicioClase && minutosFinTurno >= minutosFinClase;
    });

    return turnoQueCubre?.id ?? null;
  }

  // Núcleo de la proyección: materializa filas de ClaseProgramada a partir de
  // las ClasePlantilla activas, para los próximos `semanas` a partir de hoy.
  // Usa `this.prisma` crudo (no extendedClient) a propósito, mismo motivo que
  // turno-plantilla.service.ts#generarParaOrganizacion: se llama tanto desde
  // el cron (sin contexto de tenant en el CLS) como desde `generarAhora`, y
  // en ambos casos necesitamos fijar `organizacionId` explícitamente en cada
  // fila creada.
  //
  // Si el entrenador de una ocurrencia no tiene turno que la cubra y la
  // organización exige turno asignado (`requerimientosClase.exigirTurnoEntrenador`),
  // esa ocurrencia puntual se omite en vez de crearse sin cobertura -- coherente
  // con lo que ya hace ClaseProgramadaService.create() para el alta manual.
  async generarParaOrganizacion(organizacionId: string, semanas: number = SEMANAS_PROYECCION_DEFAULT) {
    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);
    const finVentana = new Date(hoy);
    finVentana.setUTCDate(finVentana.getUTCDate() + semanas * 7);

    const plantillas = await this.prisma.clasePlantilla.findMany({
      where: {
        organizacionId,
        activa: true,
        deletedAt: null,
        vigenciaDesde: { lte: finVentana },
        OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: hoy } }],
      },
    });
    if (plantillas.length === 0) return { clasesCreadas: 0, clasesOmitidas: 0 };

    const org = await this.prisma.organizacion.findUnique({
      where: { id: organizacionId },
      select: { configuracion: true, zonaHoraria: true },
    });
    const zonaHoraria = org?.zonaHoraria;
    const exigirTurno =
      (org?.configuracion as { requerimientosClase?: { exigirTurnoEntrenador?: boolean } } | null)?.requerimientosClase
        ?.exigirTurnoEntrenador === true;

    const plantillaIds = plantillas.map((p) => p.id);
    const existentes = await this.prisma.claseProgramada.findMany({
      where: {
        organizacionId,
        clasePlantillaId: { in: plantillaIds },
        fechaHora: { gte: hoy, lte: finVentana },
      },
      select: { clasePlantillaId: true, fechaHora: true },
    });
    // Incluye a propósito las ocurrencias eliminadas (papelera), mismo motivo
    // que turno-plantilla.service.ts: borrar una ocurrencia puntual de una
    // clase recurrente no debe revertirse en la próxima corrida del cron.
    // La clave usa la fecha LOCAL de la organización: una clase a las 20:30
    // en UTC-4 cae al día siguiente en UTC y, con la fecha UTC, se duplicaría.
    const existentesSet = new Set(
      existentes.map(
        (c) => `${c.clasePlantillaId}|${aHoraLocal(c.fechaHora, zonaHoraria).fechaSolo.toISOString().slice(0, 10)}`,
      ),
    );

    const nuevas: Prisma.ClaseProgramadaCreateManyInput[] = [];
    let omitidas = 0;

    for (const plantilla of plantillas) {
      const desde = plantilla.vigenciaDesde > hoy ? plantilla.vigenciaDesde : hoy;
      const hasta = plantilla.vigenciaHasta && plantilla.vigenciaHasta < finVentana ? plantilla.vigenciaHasta : finVentana;

      for (const fecha = new Date(desde); fecha <= hasta; fecha.setUTCDate(fecha.getUTCDate() + 1)) {
        if (fecha.getUTCDay() !== plantilla.diaSemana) continue;
        const fechaStr = fecha.toISOString().slice(0, 10);
        const clave = `${plantilla.id}|${fechaStr}`;
        if (existentesSet.has(clave)) continue;
        existentesSet.add(clave);

        let turnoId: string | null = null;
        if (plantilla.entrenadorId) {
          turnoId = await this.buscarTurnoQueCubre(
            plantilla.entrenadorId,
            plantilla.sucursalId,
            new Date(fecha),
            plantilla.horaInicio,
            plantilla.duracionMinutos,
          );
          if (!turnoId && exigirTurno) {
            omitidas++;
            continue;
          }
        }

        // horaInicio es hora "de reloj" local; fechaHora debe ser el instante
        // UTC real, o el frontend la mostraría corrida por el desfase horario.
        const fechaHora = desdeHoraLocal(
          new Date(fecha),
          plantilla.horaInicio.getUTCHours() * 60 + plantilla.horaInicio.getUTCMinutes(),
          zonaHoraria,
        );

        nuevas.push({
          organizacionId,
          sucursalId: plantilla.sucursalId,
          disciplinaId: plantilla.disciplinaId,
          entrenadorId: plantilla.entrenadorId,
          clasePlantillaId: plantilla.id,
          turnoId,
          nombreClase: plantilla.nombreClase,
          descripcion: plantilla.descripcion,
          capacidadMaxima: plantilla.capacidadMaxima,
          fechaHora,
          duracionMinutos: plantilla.duracionMinutos,
        });
      }
    }

    if (nuevas.length > 0) {
      await this.prisma.claseProgramada.createMany({ data: nuevas });
    }
    return { clasesCreadas: nuevas.length, clasesOmitidas: omitidas };
  }

  // Mantiene la agenda de clases poblada para todas las organizaciones
  // activas, sin que nadie tenga que acordarse de apretar "Generar clases ahora".
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleGeneracionDiaria() {
    this.logger.log('Generando clases proyectadas desde plantillas activas...');
    const organizaciones = await this.prisma.organizacion.findMany({
      where: { deletedAt: null, estado: 'ACTIVO' },
      select: { id: true },
    });

    for (const org of organizaciones) {
      try {
        const { clasesCreadas, clasesOmitidas } = await this.generarParaOrganizacion(org.id);
        if (clasesCreadas > 0 || clasesOmitidas > 0) {
          this.logger.log(
            `Organización ${org.id}: ${clasesCreadas} clases generadas desde plantillas, ${clasesOmitidas} omitidas por falta de turno.`,
          );
        }
      } catch (err) {
        this.logger.error(`Fallo generando clases para organización ${org.id}: ${(err as Error).message}`);
      }
    }
  }
}
