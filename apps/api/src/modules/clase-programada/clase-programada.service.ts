import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateClaseProgramadaDto } from './dto/create-clase-programada.dto';
import { UpdateClaseProgramadaDto } from './dto/update-clase-programada.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';
import { aHoraLocal } from '../../common/utils/zona-horaria.util';

const INCLUDE_RESUMEN = {
  disciplina: { select: { nombre: true } },
  entrenador: { include: { usuario: { select: { nombreCompleto: true } } } },
  sucursal: { select: { nombre: true } },
  // Solo se listan las CONFIRMADA para calcular cupos ocupados; el frontend
  // usa reservas.length contra capacidadMaxima.
  reservas: { where: { estado: 'CONFIRMADA' as const }, select: { id: true } },
} as const;

const INCLUDE_DETALLE = {
  disciplina: true,
  entrenador: { include: { usuario: { select: { nombreCompleto: true } } } },
  sucursal: { select: { nombre: true } },
  reservas: {
    include: { cliente: { select: { nombre: true, numeroDocumento: true } } },
    orderBy: { fechaReserva: 'asc' as const },
  },
} as const;

interface DatosDisponibilidad {
  entrenadorId?: string | null;
  sucursalId: string;
  fechaHora: string | Date;
  duracionMinutos?: number | null;
}

@Injectable()
export class ClaseProgramadaService {
  constructor(private readonly prisma: PrismaService, private readonly cls: ClsService) {}

  private async zonaHorariaOrganizacion(): Promise<string | null> {
    const organizacionId = this.cls.get('organizacionId');
    if (!organizacionId) return null;
    const org = await this.prisma.extendedClient.organizacion.findUnique({
      where: { id: organizacionId },
      select: { zonaHoraria: true },
    });
    return org?.zonaHoraria ?? null;
  }

  // Busca, entre los turnos de trabajo del entrenador en esa sucursal y fecha,
  // uno cuyo rango horario cubra por completo el horario de la clase. Las
  // horas de TurnoTrabajo se guardan como @db.Time sobre la fecha base
  // 1970-01-01 (mismo criterio que turno-trabajo.service.ts), así que se
  // comparan en minutos-del-día en vez de como Date completos.
  private async resolverTurnoParaClase(datos: DatosDisponibilidad): Promise<{ turnoId: string | null; disponible: boolean }> {
    if (!datos.entrenadorId) {
      // Sin entrenador asignado no hay nada que validar contra turnos.
      return { turnoId: null, disponible: true };
    }

    // `fechaHora` llega como instante UTC (el frontend convierte la hora local
    // con toISOString()), pero los turnos guardan la hora "de reloj" local
    // tal cual (06:00 se guarda como 06:00Z). Hay que llevar la clase a la
    // hora local de la organización antes de comparar; si no, una clase a las
    // 19:00 en UTC-4 se compara como 23:00 (o cae en el día siguiente).
    const { fechaSolo, minutosDelDia: minutosInicioClase } = aHoraLocal(
      new Date(datos.fechaHora),
      await this.zonaHorariaOrganizacion(),
    );
    const duracion = datos.duracionMinutos ?? 60;

    const turnos = await this.prisma.extendedClient.turnoTrabajo.findMany({
      where: {
        staffId: datos.entrenadorId,
        sucursalId: datos.sucursalId,
        fecha: fechaSolo,
        // Un turno marcado como ausente o cancelado es una excepción puntual:
        // el entrenador no está disponible ese día aunque la fila exista.
        estado: { notIn: ['AUSENTE', 'CANCELADO'] },
      },
    });

    const minutosFinClase = minutosInicioClase + duracion;

    const turnoQueCubre = turnos.find((turno) => {
      const minutosInicioTurno = turno.horaEntrada.getUTCHours() * 60 + turno.horaEntrada.getUTCMinutes();
      const minutosFinTurno = turno.horaSalida.getUTCHours() * 60 + turno.horaSalida.getUTCMinutes();
      return minutosInicioTurno <= minutosInicioClase && minutosFinTurno >= minutosFinClase;
    });

    return { turnoId: turnoQueCubre?.id ?? null, disponible: !!turnoQueCubre };
  }

  // Igual patrón que ClientesService.assertRequerimientosCliente: la política
  // vive en Organizacion.configuracion y por defecto es solo una advertencia
  // no bloqueante (exigirTurnoEntrenador ausente o false).
  private async assertDisponibilidadSiEsEstricta(entrenadorId: string | null | undefined, disponible: boolean) {
    if (!entrenadorId || disponible) return;

    const organizacionId = this.cls.get('organizacionId');
    if (!organizacionId) return;

    const org = await this.prisma.extendedClient.organizacion.findUnique({
      where: { id: organizacionId },
      select: { configuracion: true },
    });
    const exigirTurno = (org?.configuracion as { requerimientosClase?: { exigirTurnoEntrenador?: boolean } } | null)
      ?.requerimientosClase?.exigirTurnoEntrenador;

    if (exigirTurno) {
      throw new BadRequestException(
        'El entrenador seleccionado no tiene un turno de trabajo registrado en este horario y sucursal. Esta organización exige turno asignado para programar una clase.',
      );
    }
  }

  async verificarDisponibilidad(datos: DatosDisponibilidad) {
    return this.resolverTurnoParaClase(datos);
  }

  async create(createClaseProgramadaDto: CreateClaseProgramadaDto) {
    const { turnoId, disponible } = await this.resolverTurnoParaClase(createClaseProgramadaDto);
    await this.assertDisponibilidadSiEsEstricta(createClaseProgramadaDto.entrenadorId, disponible);

    const clase = await this.prisma.extendedClient.claseProgramada.create({
      // organizacionId (y sucursalId, si el usuario está atado a una) los
      // inyecta la extensión RLS en runtime (ver prisma.service.ts).
      data: { ...createClaseProgramadaDto, turnoId } as unknown as Prisma.ClaseProgramadaUncheckedCreateInput,
    });
    return { ...clase, disponibilidadEntrenador: disponible };
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.claseProgramada.findMany({
        include: INCLUDE_RESUMEN,
        orderBy: { fechaHora: 'desc' },
        skip,
        take,
      }),
      this.prisma.extendedClient.claseProgramada.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const clase = await this.prisma.extendedClient.claseProgramada.findUnique({
      where: { id },
      include: INCLUDE_DETALLE,
    });
    if (!clase) {
      throw new NotFoundException(`Clase programada con ID ${id} no encontrada`);
    }
    return clase;
  }

  async update(id: string, updateClaseProgramadaDto: UpdateClaseProgramadaDto) {
    const actual = await this.findOne(id);

    const datosParaValidar: DatosDisponibilidad = {
      entrenadorId: 'entrenadorId' in updateClaseProgramadaDto ? updateClaseProgramadaDto.entrenadorId : actual.entrenadorId,
      sucursalId: updateClaseProgramadaDto.sucursalId ?? actual.sucursalId,
      fechaHora: updateClaseProgramadaDto.fechaHora ?? actual.fechaHora,
      duracionMinutos: updateClaseProgramadaDto.duracionMinutos ?? actual.duracionMinutos,
    };
    const { turnoId, disponible } = await this.resolverTurnoParaClase(datosParaValidar);
    await this.assertDisponibilidadSiEsEstricta(datosParaValidar.entrenadorId, disponible);

    const clase = await this.prisma.extendedClient.claseProgramada.update({
      where: { id },
      data: { ...updateClaseProgramadaDto, turnoId } as unknown as Prisma.ClaseProgramadaUncheckedUpdateInput,
    });
    return { ...clase, disponibilidadEntrenador: disponible };
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.claseProgramada.delete({
      where: { id },
    });
  }

  async restore(id: string) {
    // No usamos findOne porque está filtrado por deletedAt: null
    return this.prisma.extendedClient.claseProgramada.update({
      where: { id },
      data: { deletedAt: null },
    });
  }
}
