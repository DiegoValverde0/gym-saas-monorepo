import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateClaseProgramadaDto } from './dto/create-clase-programada.dto';
import { UpdateClaseProgramadaDto } from './dto/update-clase-programada.dto';
import { EntrenadoresClaseDto } from './dto/entrenadores-clase.dto';
import { HorariosDisponiblesDto } from './dto/horarios-disponibles.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';
import { aHoraLocal } from '../../common/utils/zona-horaria.util';
import { choqueDeSalaSesion, choqueDeSesion } from '../../common/utils/choques-clase.util';
import { promoverListaEspera } from '../../common/utils/lista-espera.util';

const INCLUDE_RESUMEN = {
  disciplina: { select: { nombre: true } },
  entrenador: { include: { usuario: { select: { nombreCompleto: true } } } },
  sucursal: { select: { nombre: true } },
  sala: { select: { nombre: true } },
  // Solo se listan las que ocupan cupo (CONFIRMADA o ASISTIO); el frontend
  // usa reservas.length contra capacidadMaxima.
  reservas: { where: { estado: { in: ['CONFIRMADA' as const, 'ASISTIO' as const] } }, select: { id: true } },
} as const;

const INCLUDE_DETALLE = {
  disciplina: true,
  sala: { select: { nombre: true } },
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

  // Grilla del asistente "Nueva clase" (plan 8.2, paso 3). Todo en minutos del
  // día, por día de la semana (0 = domingo); el frontend pinta cada celda:
  //  - trabajo: horario semanal del instructor en esa sucursal (verde si la
  //    clase entra completa, amarillo si está libre pero fuera de horario).
  //  - ocupado: otras clases recurrentes del instructor, en cualquier sucursal
  //    (rojo: no se puede marcar).
  //  - sucursal: clases recurrentes de la sucursal, de cualquier instructor
  //    (gris, como referencia; puede haber varias salas).
  // Las ausencias puntuales no entran: son de fechas concretas, no de la
  // semana tipo; el choque real se valida igual al guardar.
  async horariosDisponibles(q: HorariosDisponiblesDto) {
    const db = this.prisma.extendedClient;
    const excluir = q.excluirIds ? q.excluirIds.split(',') : [];
    const minutos = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();
    const hoy = aHoraLocal(new Date(), await this.zonaHorariaOrganizacion()).fechaSolo;
    const vigente = { activa: true, OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: hoy } }] };

    const [trabajo, ocupado, sucursal] = await Promise.all([
      q.entrenadorId
        ? db.turnoPlantilla.findMany({
            where: { staffId: q.entrenadorId, sucursalId: q.sucursalId, activa: true },
            select: { diaSemana: true, horaEntrada: true, horaSalida: true },
          })
        : Promise.resolve([]),
      q.entrenadorId
        ? db.clasePlantilla.findMany({
            where: { ...vigente, entrenadorId: q.entrenadorId, id: { notIn: excluir } },
            select: { diaSemana: true, horaInicio: true, duracionMinutos: true, nombreClase: true, sucursal: { select: { nombre: true } } },
          })
        : Promise.resolve([]),
      db.clasePlantilla.findMany({
        where: { ...vigente, sucursalId: q.sucursalId, id: { notIn: excluir } },
        select: {
          diaSemana: true,
          horaInicio: true,
          duracionMinutos: true,
          nombreClase: true,
          entrenador: { select: { usuario: { select: { nombreCompleto: true } } } },
        },
      }),
    ]);

    // Clases de otros instructores que ya usan la sala elegida (fase 6, DB-2):
    // también bloquean ese horario.
    const enSala: Array<{ diaSemana: number; horaInicio: Date; duracionMinutos: number; nombreClase: string; sala: { nombre: string } | null }> = q.salaId
      ? await db.clasePlantilla.findMany({
          where: { ...vigente, salaId: q.salaId, id: { notIn: excluir }, ...(q.entrenadorId ? { entrenadorId: { not: q.entrenadorId } } : {}) },
          select: { diaSemana: true, horaInicio: true, duracionMinutos: true, nombreClase: true, sala: { select: { nombre: true } } },
        })
      : [];

    return {
      trabajo: trabajo.map((t) => ({ diaSemana: t.diaSemana, desde: minutos(t.horaEntrada), hasta: minutos(t.horaSalida) })),
      ocupado: [
        ...enSala.map((c) => ({
          diaSemana: c.diaSemana,
          desde: minutos(c.horaInicio),
          hasta: minutos(c.horaInicio) + c.duracionMinutos,
          nombre: c.nombreClase,
          sucursal: c.sala?.nombre ?? 'Sala',
        })),
        ...ocupado.map((c) => ({
        diaSemana: c.diaSemana,
        desde: minutos(c.horaInicio),
        hasta: minutos(c.horaInicio) + c.duracionMinutos,
        nombre: c.nombreClase,
        sucursal: c.sucursal.nombre,
      })),
      ],
      sucursal: sucursal.map((c) => ({
        diaSemana: c.diaSemana,
        desde: minutos(c.horaInicio),
        hasta: minutos(c.horaInicio) + c.duracionMinutos,
        nombre: c.nombreClase,
        instructor: c.entrenador?.usuario.nombreCompleto ?? null,
      })),
    };
  }

  // "Solo esta sesión → Cancelar" (plan 8.1 y 8.5): la sesión queda cancelada
  // y sus reservas confirmadas también, en el acto.
  async cancelarSesion(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.$transaction(async (tx: Prisma.TransactionClient) => {
      const reservas = await tx.reservaClase.updateMany({
        where: { claseId: id, estado: { in: ['CONFIRMADA', 'EN_ESPERA'] } },
        data: { estado: 'CANCELADA' },
      });
      await tx.claseProgramada.update({ where: { id }, data: { estado: 'INACTIVO' } });
      return { reservasCanceladas: reservas.count };
    });
  }

  async verificarDisponibilidad(datos: DatosDisponibilidad) {
    return this.resolverTurnoParaClase(datos);
  }

  // Plan 8.3: el instructor no puede tener otra sesión que se solape.
  // Fase 6 (DB-2): también la sala, si la sesión tiene una.
  private async assertSinChoqueDeInstructor(datos: DatosDisponibilidad & { salaId?: string | null }, excluirClaseId?: string) {
    const db = this.prisma.extendedClient as unknown as Prisma.TransactionClient;
    const zonaHoraria = await this.zonaHorariaOrganizacion();
    const choque =
      (await choqueDeSesion(db, { ...datos, excluirClaseId }, zonaHoraria)) ??
      (await choqueDeSalaSesion(db, { ...datos, excluirClaseId }, zonaHoraria));
    if (choque) throw new BadRequestException(choque);
    if (datos.salaId) {
      const sala = await db.sala.findUnique({ where: { id: datos.salaId }, select: { sucursalId: true } });
      if (!sala || sala.sucursalId !== datos.sucursalId) throw new BadRequestException('La sala elegida no es de esa sucursal.');
    }
  }

  async create(createClaseProgramadaDto: CreateClaseProgramadaDto) {
    // Fase 6 (DB-1): los planes de una clase se guardan en la serie; una
    // sesión suelta solo puede ser abierta o para miembros.
    if (createClaseProgramadaDto.acceso === 'PLANES') {
      throw new BadRequestException('Una sesión suelta no puede limitarse a ciertos planes: créala como clase recurrente o usa la regla de su disciplina.');
    }
    await this.assertSinChoqueDeInstructor(createClaseProgramadaDto);
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

    const datosParaValidar: DatosDisponibilidad & { salaId?: string | null } = {
      salaId: 'salaId' in updateClaseProgramadaDto ? updateClaseProgramadaDto.salaId : actual.salaId,
      entrenadorId: 'entrenadorId' in updateClaseProgramadaDto ? updateClaseProgramadaDto.entrenadorId : actual.entrenadorId,
      sucursalId: updateClaseProgramadaDto.sucursalId ?? actual.sucursalId,
      fechaHora: updateClaseProgramadaDto.fechaHora ?? actual.fechaHora,
      duracionMinutos: updateClaseProgramadaDto.duracionMinutos ?? actual.duracionMinutos,
    };
    if (updateClaseProgramadaDto.estado !== 'INACTIVO') await this.assertSinChoqueDeInstructor(datosParaValidar, id);
    const { turnoId, disponible } = await this.resolverTurnoParaClase(datosParaValidar);
    await this.assertDisponibilidadSiEsEstricta(datosParaValidar.entrenadorId, disponible);

    const clase = await this.prisma.extendedClient.claseProgramada.update({
      where: { id },
      data: { ...updateClaseProgramadaDto, turnoId } as unknown as Prisma.ClaseProgramadaUncheckedUpdateInput,
    });
    // Más cupos en esta sesión: sube la lista de espera (fase 6, DB-3).
    const promovidos =
      updateClaseProgramadaDto.capacidadMaxima && updateClaseProgramadaDto.capacidadMaxima > actual.capacidadMaxima
        ? await this.prisma.extendedClient.$transaction((tx: Prisma.TransactionClient) => promoverListaEspera(tx, id))
        : [];
    return { ...clase, disponibilidadEntrenador: disponible, promovidos };
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
