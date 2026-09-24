import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateClaseProgramadaDto } from './dto/create-clase-programada.dto';
import { UpdateClaseProgramadaDto } from './dto/update-clase-programada.dto';
import { EntrenadoresClaseDto } from './dto/entrenadores-clase.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';
import { aHoraLocal } from '../../common/utils/zona-horaria.util';

const INCLUDE_RESUMEN = {
  disciplina: { select: { nombre: true } },
  entrenador: { include: { usuario: { select: { nombreCompleto: true } } } },
  sucursal: { select: { nombre: true } },
  // Solo se listan las que ocupan cupo (CONFIRMADA o ASISTIO); el frontend
  // usa reservas.length contra capacidadMaxima.
  reservas: { where: { estado: { in: ['CONFIRMADA' as const, 'ASISTIO' as const] } }, select: { id: true } },
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

  // Lista para el selector de entrenador: quién imparte la disciplina y quién
  // tiene turno/horario que cubra la clase. Ordenada con los más adecuados
  // primero. `disponible`/`imparteDisciplina` son null cuando falta el dato
  // para calcularlos (ej. todavía no se eligió hora o disciplina).
  async entrenadoresParaClase(q: EntrenadoresClaseDto) {
    const db = this.prisma.extendedClient;
    const duracion = q.duracionMinutos ?? 60;
    const diasSemana = q.diasSemana ? [...new Set(q.diasSemana.split(',').map(Number))] : [];

    const staff: Array<{
      id: string;
      usuario: { nombreCompleto: string } | null;
      staffDisciplinas: { disciplinaId: string }[];
      turnosPlantilla: { diaSemana: number; horaEntrada: Date; horaSalida: Date }[];
    }> = await db.perfilStaff.findMany({
      where: { estado: 'ACTIVO' },
      include: {
        usuario: { select: { nombreCompleto: true } },
        staffDisciplinas: { select: { disciplinaId: true } },
        turnosPlantilla: { where: { activa: true, sucursalId: q.sucursalId }, select: { diaSemana: true, horaEntrada: true, horaSalida: true } },
      },
    });

    const minutos = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();
    const cubre = (bloque: { horaEntrada: Date; horaSalida: Date }, inicio: number) =>
      minutos(bloque.horaEntrada) <= inicio && minutos(bloque.horaSalida) >= inicio + duracion;

    // Clase puntual: turnos reales de ese día en la sucursal.
    let turnosDelDia: { staffId: string; horaEntrada: Date; horaSalida: Date }[] = [];
    let inicioPuntual = 0;
    if (q.fechaHora) {
      const local = aHoraLocal(new Date(q.fechaHora), await this.zonaHorariaOrganizacion());
      inicioPuntual = local.minutosDelDia;
      turnosDelDia = await db.turnoTrabajo.findMany({
        where: { sucursalId: q.sucursalId, fecha: local.fechaSolo, estado: { notIn: ['AUSENTE', 'CANCELADO'] } },
        select: { staffId: true, horaEntrada: true, horaSalida: true },
      });
    }
    const inicioRecurrente = q.horaInicio ? Number(q.horaInicio.slice(0, 2)) * 60 + Number(q.horaInicio.slice(3, 5)) : 0;

    const resultado = staff.map((s) => {
      let disponible: boolean | null = null;
      let diasSinTurno: number[] = [];
      if (q.fechaHora) {
        disponible = turnosDelDia.some((t) => t.staffId === s.id && cubre(t, inicioPuntual));
      } else if (diasSemana.length > 0 && q.horaInicio) {
        diasSinTurno = diasSemana.filter((dia) => !s.turnosPlantilla.some((b) => b.diaSemana === dia && cubre(b, inicioRecurrente)));
        disponible = diasSinTurno.length === 0;
      }
      return {
        id: s.id,
        nombre: s.usuario?.nombreCompleto ?? 'Sin nombre',
        imparteDisciplina: q.disciplinaId ? s.staffDisciplinas.some((sd) => sd.disciplinaId === q.disciplinaId) : null,
        disponible,
        diasSinTurno,
      };
    });

    const puntaje = (r: (typeof resultado)[number]) => (r.disponible ? 2 : 0) + (r.imparteDisciplina ? 1 : 0);
    return resultado.sort((a, b) => puntaje(b) - puntaje(a) || a.nombre.localeCompare(b.nombre));
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
