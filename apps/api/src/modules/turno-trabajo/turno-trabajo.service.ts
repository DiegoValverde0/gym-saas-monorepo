import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { RedisClientType } from 'redis';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateTurnoTrabajoDto } from './dto/create-turno-trabajo.dto';
import { UpdateTurnoTrabajoDto } from './dto/update-turno-trabajo.dto';
import { AusenciaDto, JornadasHoyQueryDto, MotivoAusencia, QuitarAusenciaDto, RangoAusenciasQueryDto } from './dto/ausencia.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';
import { aHoraLocal, desdeHoraLocal } from '../../common/utils/zona-horaria.util';
import { choqueDeSesion } from '../../common/utils/choques-clase.util';
import { buscarStaffPorPin } from '../../common/utils/pin.util';

const INCLUDE_TURNO = {
  staff: { include: { usuario: { select: { nombreCompleto: true } } } },
  sucursal: { select: { nombre: true } },
} as const;

const DIA_MS = 24 * 60 * 60_000;
const fechaISO = (d: Date) => d.toISOString().slice(0, 10);
const minutosDe = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Minutos de gracia antes de considerar "atrasada" a una persona que no
// marcó (configuracion.jornadas.toleranciaAtrasoMinutos, plan 7.2).
const TOLERANCIA_ATRASO_DEFAULT = 10;
const MAX_DIAS_AUSENCIA = 366;
const VENTANA_AUSENCIAS_PASADAS_DIAS = 60;
const VENTANA_AUSENCIAS_FUTURAS_DIAS = 180;

const MAX_INTENTOS_PIN = 5;
const BLOQUEO_PIN_SEGUNDOS = 5 * 60;

const NOMBRE_MOTIVO: Record<MotivoAusencia, string> = {
  VACACIONES: 'Vacaciones',
  ENFERMEDAD: 'Enfermedad',
  PERMISO: 'Permiso',
  OTRO: 'Otro',
};

// Estado de una jornada para la vista Hoy (calculado, no se guarda).
export type EstadoJornada = 'por_empezar' | 'atrasado' | 'en_turno' | 'termino' | 'no_marco' | 'sin_marcar' | 'ausente' | 'cancelado';

export interface TurnoConRelaciones {
  id: string;
  staffId: string;
  sucursalId: string;
  fecha: Date;
  horaEntrada: Date;
  horaSalida: Date;
  horaIngresoReal: Date | null;
  horaSalidaReal: Date | null;
  estado: string;
  motivoAusencia: string | null;
  staff: { usuario: { nombreCompleto: string } | null } | null;
  sucursal: { nombre: string } | null;
}

interface ContextoOrganizacion {
  organizacionId: string;
  zonaHoraria: string | null;
  tolerancia: number;
  ahora: { fechaSolo: Date; minutosDelDia: number };
}

@Injectable()
export class TurnoTrabajoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
  ) {}

  // Las horas se guardan como Date (@db.Time) pero el DTO las maneja como
  // texto "HH:MM" -- mismo patrón ya usado en plan.service.ts. `fecha` llega
  // como "YYYY-MM-DD" (@IsDateString la acepta), pero Prisma exige un
  // DateTime ISO completo -- "premature end of input" si se manda tal cual.
  private normalizarHoras<T extends { fecha?: string; horaEntrada?: string; horaSalida?: string }>(data: T) {
    const result: Record<string, unknown> = { ...data };
    if (data.fecha) {
      result.fecha = new Date(`${data.fecha}T00:00:00Z`);
    }
    if (data.horaEntrada) {
      result.horaEntrada = new Date(`1970-01-01T${data.horaEntrada}:00Z`);
    }
    if (data.horaSalida) {
      result.horaSalida = new Date(`1970-01-01T${data.horaSalida}:00Z`);
    }
    return result;
  }

  async create(createTurnoTrabajoDto: CreateTurnoTrabajoDto) {
    return this.prisma.extendedClient.turnoTrabajo.create({
      // organizacionId (y sucursalId, si el usuario está atado a una) los
      // inyecta la extensión RLS en runtime (ver prisma.service.ts).
      data: this.normalizarHoras(createTurnoTrabajoDto) as unknown as Prisma.TurnoTrabajoUncheckedCreateInput,
    });
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.turnoTrabajo.findMany({
        include: INCLUDE_TURNO,
        orderBy: { fecha: 'desc' },
        skip,
        take,
      }),
      this.prisma.extendedClient.turnoTrabajo.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const turno = await this.prisma.extendedClient.turnoTrabajo.findUnique({
      where: { id },
      include: INCLUDE_TURNO,
    });
    if (!turno) {
      throw new NotFoundException(`Turno de trabajo con ID ${id} no encontrado`);
    }
    return turno;
  }

  async update(id: string, updateTurnoTrabajoDto: UpdateTurnoTrabajoDto) {
    await this.findOne(id);
    return this.prisma.extendedClient.turnoTrabajo.update({
      where: { id },
      data: this.normalizarHoras(updateTurnoTrabajoDto) as unknown as Prisma.TurnoTrabajoUncheckedUpdateInput,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.turnoTrabajo.delete({
      where: { id },
    });
  }

  async restore(id: string) {
    // No usamos findOne porque está filtrado por deletedAt: null
    return this.prisma.extendedClient.turnoTrabajo.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  // =========================================================================
  // AUTOSERVICIO: "MI TURNO DE HOY" (marcar ingreso/salida real del propio staff)
  // =========================================================================
  // A propósito NO exige el permiso 'turnos:crear/actualizar' (ver
  // turno-trabajo.controller.ts): ese permiso es para programar/editar
  // turnos AJENOS, y normalmente lo tiene el ADMIN_GYM, no cada entrenador o
  // recepcionista. Marcar el propio ingreso/salida solo requiere ser un
  // staff autenticado con un turno hoy -- si el usuario no tiene perfil de
  // staff (ej. un cliente con cuenta), esto falla igual con un 404 claro.

  private async encontrarStaffDelUsuario(usuarioId: string) {
    const staff = await this.prisma.extendedClient.perfilStaff.findUnique({ where: { usuarioId } });
    if (!staff) {
      throw new NotFoundException('Tu usuario no es parte del equipo de este gimnasio.');
    }
    return staff;
  }

  private async encontrarTurnoDeHoy(usuarioId: string) {
    return this.turnoDeHoyDe(await this.encontrarStaffDelUsuario(usuarioId));
  }

  private async turnoDeHoyDe(staff: { id: string; organizacionId: string }) {
    // "Hoy" en la zona horaria de la organización: con la fecha UTC, después
    // de las 20:00 en La Paz ya se buscaba el turno de mañana.
    const org = await this.prisma.extendedClient.organizacion.findUnique({
      where: { id: staff.organizacionId },
      select: { zonaHoraria: true },
    });
    const ahora = aHoraLocal(new Date(), org?.zonaHoraria);

    const turnos: TurnoConRelaciones[] = await this.prisma.extendedClient.turnoTrabajo.findMany({
      where: { staffId: staff.id, fecha: ahora.fechaSolo, estado: { notIn: ['AUSENTE', 'CANCELADO'] } },
      include: INCLUDE_TURNO,
      orderBy: { horaEntrada: 'asc' },
    });
    if (turnos.length === 0) {
      throw new NotFoundException('No tienes una jornada de trabajo hoy.');
    }
    // Con turno partido hay varias jornadas: la que está en curso; si no, la
    // próxima sin marcar que todavía no terminó; si no, la última.
    const sinEntrada = turnos.filter((t) => !t.horaIngresoReal);
    return (
      turnos.find((t) => t.horaIngresoReal && !t.horaSalidaReal) ??
      sinEntrada.find((t) => minutosDe(t.horaSalida) > ahora.minutosDelDia) ??
      sinEntrada[sinEntrada.length - 1] ??
      turnos[turnos.length - 1]
    );
  }

  // =========================================================================
  // MARCAJE CON PIN EN LA TABLET (fase 6, DB-4)
  // =========================================================================
  // El PIN identifica a la persona; con su jornada de hoy se marca la entrada
  // o, si ya entró, la salida. Tras 5 PIN incorrectos seguidos desde la misma
  // sesión se bloquea 5 minutos (un PIN de 4 dígitos se puede adivinar).
  async marcarConPin(pin: string, usuarioTablet: string) {
    const organizacionId = this.cls.get('organizacionId');
    if (!organizacionId) throw new ForbiddenException('Selecciona una organización.');
    const clave = `pin:intentos:${organizacionId}:${usuarioTablet}`;
    const intentos = Number((await this.redisClient.get(clave)) ?? 0);
    if (intentos >= MAX_INTENTOS_PIN) {
      throw new HttpException('Demasiados PIN incorrectos. Espera 5 minutos o pide ayuda en recepción.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const staff = await buscarStaffPorPin(this.prisma.extendedClient, pin);
    if (!staff) {
      await this.redisClient.multi().incr(clave).expire(clave, BLOQUEO_PIN_SEGUNDOS).exec();
      throw new BadRequestException('PIN incorrecto.');
    }
    await this.redisClient.del(clave);

    const turno = await this.turnoDeHoyDe(staff);
    const nombre = staff.usuario.nombreCompleto.split(' ')[0];
    let accion: 'entrada' | 'salida';
    if (!turno.horaIngresoReal) {
      await this.registrarIngreso(turno);
      accion = 'entrada';
    } else if (!turno.horaSalidaReal) {
      await this.registrarSalida(turno);
      accion = 'salida';
    } else {
      throw new BadRequestException(`${nombre}, ya marcaste la entrada y la salida de hoy.`);
    }
    const { zonaHoraria } = await this.contextoOrganizacion();
    return {
      persona: nombre,
      accion,
      hora: aHoraLocal(new Date(), zonaHoraria).minutosDelDia,
      horario: `${hhmm(minutosDe(turno.horaEntrada))}–${hhmm(minutosDe(turno.horaSalida))}`,
    };
  }

  async miTurnoDeHoy(usuarioId: string) {
    return this.encontrarTurnoDeHoy(usuarioId);
  }

  async marcarIngreso(usuarioId: string) {
    const turno = await this.encontrarTurnoDeHoy(usuarioId);
    if (turno.horaIngresoReal) {
      throw new BadRequestException('Ya marcaste tu entrada de hoy.');
    }
    return this.registrarIngreso(turno);
  }

  async marcarSalida(usuarioId: string) {
    const turno = await this.encontrarTurnoDeHoy(usuarioId);
    if (!turno.horaIngresoReal) {
      throw new BadRequestException('Primero marca tu entrada; después, la salida.');
    }
    if (turno.horaSalidaReal) {
      throw new BadRequestException('Ya marcaste tu salida de hoy.');
    }
    return this.registrarSalida(turno);
  }

  // =========================================================================
  // JORNADAS DEL EQUIPO (plan de simplificación, sección 7)
  // =========================================================================

  private async contextoOrganizacion(): Promise<ContextoOrganizacion> {
    const organizacionId = this.cls.get('organizacionId');
    if (!organizacionId) throw new ForbiddenException('Selecciona una organización.');
    const org = await this.prisma.extendedClient.organizacion.findUnique({
      where: { id: organizacionId },
      select: { zonaHoraria: true, configuracion: true },
    });
    const zonaHoraria = org?.zonaHoraria ?? null;
    const tolerancia = (org?.configuracion as { jornadas?: { toleranciaAtrasoMinutos?: unknown } } | null)?.jornadas?.toleranciaAtrasoMinutos;
    return {
      organizacionId,
      zonaHoraria,
      tolerancia: typeof tolerancia === 'number' && tolerancia >= 0 ? tolerancia : TOLERANCIA_ATRASO_DEFAULT,
      ahora: aHoraLocal(new Date(), zonaHoraria),
    };
  }

  // Estado de una jornada calculado al vuelo (7.2 a), sin columnas nuevas:
  // estado guardado + hora actual + ingreso real + tolerancia de atraso.
  private estadoJornada(t: TurnoConRelaciones, ctx: ContextoOrganizacion): { estado: EstadoJornada; minutosAtraso: number } {
    if (t.estado === 'AUSENTE') return { estado: 'ausente', minutosAtraso: 0 };
    if (t.estado === 'CANCELADO') return { estado: 'cancelado', minutosAtraso: 0 };
    const inicio = minutosDe(t.horaEntrada);
    const fin = minutosDe(t.horaSalida);
    if (t.horaIngresoReal) {
      const llegada = aHoraLocal(t.horaIngresoReal, ctx.zonaHoraria).minutosDelDia;
      const minutosAtraso = llegada > inicio + ctx.tolerancia ? llegada - inicio : 0;
      return { estado: t.horaSalidaReal ? 'termino' : 'en_turno', minutosAtraso };
    }
    if (t.estado === 'COMPLETADO') return { estado: 'termino', minutosAtraso: 0 };
    // Jornada de otro día sin marcar: no se sabe si vino.
    if (t.fecha.getTime() !== ctx.ahora.fechaSolo.getTime()) return { estado: 'sin_marcar', minutosAtraso: 0 };
    const ahora = ctx.ahora.minutosDelDia;
    if (ahora >= fin) return { estado: 'no_marco', minutosAtraso: 0 };
    if (ahora > inicio + ctx.tolerancia) return { estado: 'atrasado', minutosAtraso: ahora - inicio };
    return { estado: 'por_empezar', minutosAtraso: 0 };
  }

  // Vista "Hoy": una fila por jornada de hoy (una persona con turno partido
  // tiene dos), en la sucursal pedida o en todas.
  async hoy(query: JornadasHoyQueryDto) {
    const ctx = await this.contextoOrganizacion();
    const hoy = ctx.ahora.fechaSolo;
    const turnos: TurnoConRelaciones[] = await this.prisma.extendedClient.turnoTrabajo.findMany({
      where: { fecha: hoy, ...(query.sucursalId ? { sucursalId: query.sucursalId } : {}) },
      include: INCLUDE_TURNO,
      orderBy: [{ horaEntrada: 'asc' }],
    });

    const ausentes = turnos.filter((t) => t.estado === 'AUSENTE').map((t) => t.staffId);
    const ausencias = ausentes.length ? await this.agruparAusencias(hoy, new Date(hoy.getTime() + VENTANA_AUSENCIAS_FUTURAS_DIAS * DIA_MS), ausentes) : [];

    return {
      fecha: fechaISO(hoy),
      ahora: ctx.ahora.minutosDelDia,
      toleranciaAtrasoMinutos: ctx.tolerancia,
      jornadas: turnos.map((t) => {
        const { estado, minutosAtraso } = this.estadoJornada(t, ctx);
        return {
          id: t.id,
          staffId: t.staffId,
          staffNombre: t.staff?.usuario?.nombreCompleto ?? 'Sin nombre',
          sucursalId: t.sucursalId,
          sucursalNombre: t.sucursal?.nombre ?? null,
          inicio: minutosDe(t.horaEntrada),
          fin: minutosDe(t.horaSalida),
          ingresoReal: t.horaIngresoReal ? aHoraLocal(t.horaIngresoReal, ctx.zonaHoraria).minutosDelDia : null,
          salidaReal: t.horaSalidaReal ? aHoraLocal(t.horaSalidaReal, ctx.zonaHoraria).minutosDelDia : null,
          estado,
          minutosAtraso,
          motivoAusencia: t.motivoAusencia,
          ausenteHasta: estado === 'ausente' ? (ausencias.find((a) => a.staffId === t.staffId)?.hasta ?? null) : null,
        };
      }),
    };
  }

  // Marcaje hecho por quien gestiona el equipo (vista Hoy): "Marcar entrada"
  // de alguien que llegó y no marcó. Solo jornadas de hoy.
  async marcarIngresoDe(id: string) {
    const turno = await this.findOne(id);
    await this.assertJornadaDeHoy(turno);
    if (turno.horaIngresoReal) throw new BadRequestException('La entrada de esta jornada ya está marcada.');
    return this.registrarIngreso(turno);
  }

  async marcarSalidaDe(id: string) {
    const turno = await this.findOne(id);
    await this.assertJornadaDeHoy(turno);
    if (!turno.horaIngresoReal) throw new BadRequestException('Primero hay que marcar la entrada.');
    if (turno.horaSalidaReal) throw new BadRequestException('La salida de esta jornada ya está marcada.');
    return this.registrarSalida(turno);
  }

  private async assertJornadaDeHoy(turno: { fecha: Date; estado: string }) {
    const { ahora } = await this.contextoOrganizacion();
    if (turno.fecha.getTime() !== ahora.fechaSolo.getTime()) {
      throw new BadRequestException('Solo se puede marcar la entrada o la salida de una jornada de hoy.');
    }
    if (turno.estado === 'AUSENTE' || turno.estado === 'CANCELADO') {
      throw new BadRequestException('Esa jornada está registrada como ausencia o cancelada.');
    }
  }

  private registrarIngreso(turno: { id: string }) {
    return this.prisma.extendedClient.turnoTrabajo.update({
      where: { id: turno.id },
      data: { horaIngresoReal: new Date() },
    });
  }

  private registrarSalida(turno: { id: string }) {
    return this.prisma.extendedClient.turnoTrabajo.update({
      where: { id: turno.id },
      data: { horaSalidaReal: new Date(), estado: 'COMPLETADO' },
    });
  }

  // ---------------------------------------------------------------------
  // Ausencias por rango (7.2 c). Sin tabla nueva: una ausencia son las
  // jornadas AUSENTE de la persona, con el motivo en `motivoAusencia`.
  // ---------------------------------------------------------------------

  private rango(desdeTexto: string, hastaTexto: string) {
    const desde = new Date(`${desdeTexto.slice(0, 10)}T00:00:00Z`);
    const hasta = new Date(`${hastaTexto.slice(0, 10)}T00:00:00Z`);
    if (hasta < desde) throw new BadRequestException('La fecha "hasta" debe ser igual o posterior a "desde".');
    if (hasta.getTime() - desde.getTime() > MAX_DIAS_AUSENCIA * DIA_MS) {
      throw new BadRequestException(`Una ausencia puede durar como máximo ${MAX_DIAS_AUSENCIA} días.`);
    }
    return { desde, hasta };
  }

  // Qué cambiaría al registrar la ausencia: jornadas a marcar, días del
  // horario que todavía no tienen jornada generada (se crean ya ausentes para
  // que el generador no los vuelva a programar) y clases de la persona.
  private async analizarAusencia(db: Prisma.TransactionClient, dto: AusenciaDto) {
    const ctx = await this.contextoOrganizacion();
    const { desde, hasta } = this.rango(dto.desde, dto.hasta);
    const staff = await db.perfilStaff.findUnique({
      where: { id: dto.staffId },
      select: { id: true, usuario: { select: { nombreCompleto: true } } },
    });
    if (!staff) throw new NotFoundException('No se encontró a esa persona del equipo.');

    const turnos = await db.turnoTrabajo.findMany({
      where: { staffId: dto.staffId, fecha: { gte: desde, lte: hasta } },
      select: { id: true, fecha: true, estado: true, horaIngresoReal: true, horaEntrada: true, horaSalida: true },
    });
    // Las jornadas ya trabajadas (con entrada marcada) no se tocan.
    const aMarcar = turnos.filter((t) => !t.horaIngresoReal && (t.estado === 'PROGRAMADO' || t.estado === 'AUSENTE'));
    const yaTrabajadas = turnos.filter((t) => !!t.horaIngresoReal || t.estado === 'COMPLETADO').length;

    const plantillas = await db.turnoPlantilla.findMany({
      where: {
        staffId: dto.staffId,
        activa: true,
        vigenciaDesde: { lte: hasta },
        OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: desde } }],
      },
      select: { sucursalId: true, diaSemana: true, horaEntrada: true, horaSalida: true, vigenciaDesde: true, vigenciaHasta: true },
    });
    // Las jornadas borradas (papelera) también bloquean la generación de ese
    // horario (ver TurnoPlantillaService), así que cuentan como ocupadas.
    const borradas = await db.turnoTrabajo.findMany({
      where: { staffId: dto.staffId, fecha: { gte: desde, lte: hasta }, deletedAt: { not: null } },
      select: { fecha: true, horaEntrada: true, horaSalida: true },
    });
    const ocupados = [...turnos, ...borradas].map((e) => ({ fecha: e.fecha.getTime(), desde: minutosDe(e.horaEntrada), hasta: minutosDe(e.horaSalida) }));
    const aCrear: { sucursalId: string; fecha: Date; horaEntrada: Date; horaSalida: Date }[] = [];
    for (let f = desde.getTime(); f <= hasta.getTime(); f += DIA_MS) {
      const fecha = new Date(f);
      for (const p of plantillas) {
        if (p.diaSemana !== fecha.getUTCDay() || p.vigenciaDesde > fecha || (p.vigenciaHasta && p.vigenciaHasta < fecha)) continue;
        const ini = minutosDe(p.horaEntrada);
        const fin = minutosDe(p.horaSalida);
        if (ocupados.some((o) => o.fecha === f && o.desde < fin && ini < o.hasta)) continue;
        ocupados.push({ fecha: f, desde: ini, hasta: fin });
        aCrear.push({ sucursalId: p.sucursalId, fecha, horaEntrada: p.horaEntrada, horaSalida: p.horaSalida });
      }
    }

    const clases = await db.claseProgramada.findMany({
      where: {
        entrenadorId: dto.staffId,
        estado: 'ACTIVO',
        fechaHora: { gte: desdeHoraLocal(desde, 0, ctx.zonaHoraria), lt: desdeHoraLocal(new Date(hasta.getTime() + DIA_MS), 0, ctx.zonaHoraria) },
      },
      select: { id: true, nombreClase: true, fechaHora: true, duracionMinutos: true, sucursalId: true, sucursal: { select: { nombre: true } } },
      orderBy: { fechaHora: 'asc' },
    });

    const dias = new Set([...aMarcar.map((t) => fechaISO(t.fecha)), ...aCrear.map((t) => fechaISO(t.fecha))]);
    return { ctx, staff, aMarcar, aCrear, yaTrabajadas, clases, dias: dias.size };
  }

  private describirClase(c: { id: string; nombreClase: string; fechaHora: Date; sucursal: { nombre: string } }, zonaHoraria: string | null) {
    const local = aHoraLocal(c.fechaHora, zonaHoraria);
    return { id: c.id, nombreClase: c.nombreClase, fecha: fechaISO(local.fechaSolo), hora: hhmm(local.minutosDelDia), sucursal: c.sucursal.nombre };
  }

  async vistaPreviaAusencia(dto: AusenciaDto) {
    const r = await this.analizarAusencia(this.prisma.extendedClient, dto);
    return {
      persona: r.staff.usuario?.nombreCompleto ?? 'Sin nombre',
      diasAfectados: r.dias,
      jornadasYaTrabajadas: r.yaTrabajadas,
      clases: r.clases.map((c) => this.describirClase(c, r.ctx.zonaHoraria)),
    };
  }

  async registrarAusencia(dto: AusenciaDto) {
    if (dto.reemplazoStaffId === dto.staffId) {
      throw new BadRequestException('El reemplazo tiene que ser otra persona.');
    }
    const nota = dto.nota?.trim();
    const motivo = nota ? `${NOMBRE_MOTIVO[dto.motivo]} · ${nota}` : NOMBRE_MOTIVO[dto.motivo];

    return this.prisma.extendedClient.$transaction(async (tx: Prisma.TransactionClient) => {
      const r = await this.analizarAusencia(tx, dto);
      if (r.dias === 0) {
        throw new BadRequestException(
          r.yaTrabajadas > 0
            ? 'En esas fechas la persona ya marcó su entrada: no hay jornadas para registrar como ausencia.'
            : 'La persona no tiene jornadas en esas fechas (según su horario). No hace falta registrar una ausencia.',
        );
      }
      if (r.aMarcar.length > 0) {
        await tx.turnoTrabajo.updateMany({
          where: { id: { in: r.aMarcar.map((t) => t.id) } },
          data: { estado: 'AUSENTE', motivoAusencia: motivo },
        });
      }
      if (r.aCrear.length > 0) {
        await tx.turnoTrabajo.createMany({
          data: r.aCrear.map((t) => ({ ...t, staffId: dto.staffId, estado: 'AUSENTE' as const, motivoAusencia: motivo })) as Prisma.TurnoTrabajoCreateManyInput[],
        });
      }

      if (dto.reemplazoStaffId) {
        const reemplazo = await tx.perfilStaff.findUnique({ where: { id: dto.reemplazoStaffId }, select: { id: true } });
        if (!reemplazo) throw new NotFoundException('No se encontró a la persona de reemplazo.');
      }

      // Reemplazo: cada clase pasa al otro instructor salvo que le choque con
      // otra clase suya (se informa y queda como estaba).
      type ClaseDescrita = ReturnType<TurnoTrabajoService['describirClase']> & { motivo?: string };
      const reasignadas: ClaseDescrita[] = [];
      const sinReemplazo: ClaseDescrita[] = [];
      for (const clase of r.clases) {
        const descripcion = this.describirClase(clase, r.ctx.zonaHoraria);
        if (!dto.reemplazoStaffId) {
          sinReemplazo.push(descripcion);
          continue;
        }
        const choque = await choqueDeSesion(
          tx,
          { entrenadorId: dto.reemplazoStaffId, fechaHora: clase.fechaHora, duracionMinutos: clase.duracionMinutos, excluirClaseId: clase.id },
          r.ctx.zonaHoraria,
        );
        if (choque) {
          sinReemplazo.push({ ...descripcion, motivo: choque });
          continue;
        }
        const local = aHoraLocal(clase.fechaHora, r.ctx.zonaHoraria);
        const turnosReemplazo = await tx.turnoTrabajo.findMany({
          where: { staffId: dto.reemplazoStaffId, sucursalId: clase.sucursalId, fecha: local.fechaSolo, estado: { notIn: ['AUSENTE', 'CANCELADO'] } },
          select: { id: true, horaEntrada: true, horaSalida: true },
        });
        const cubre = turnosReemplazo.find(
          (t) => minutosDe(t.horaEntrada) <= local.minutosDelDia && minutosDe(t.horaSalida) >= local.minutosDelDia + clase.duracionMinutos,
        );
        await tx.claseProgramada.update({
          where: { id: clase.id },
          data: { entrenadorId: dto.reemplazoStaffId, turnoId: cubre?.id ?? null },
        });
        reasignadas.push(descripcion);
      }

      return { diasAfectados: r.dias, clasesReasignadas: reasignadas, clasesSinReemplazo: sinReemplazo };
    });
  }

  // "Quitar ausencia" (deshacer): las jornadas vuelven a quedar programadas.
  // Las clases que se pasaron a un reemplazo no se devuelven solas.
  async quitarAusencia(dto: QuitarAusenciaDto) {
    const { desde, hasta } = this.rango(dto.desde, dto.hasta);
    const { count } = await this.prisma.extendedClient.turnoTrabajo.updateMany({
      where: { staffId: dto.staffId, fecha: { gte: desde, lte: hasta }, estado: 'AUSENTE' },
      data: { estado: 'PROGRAMADO', motivoAusencia: null },
    });
    return { jornadasRestablecidas: count };
  }

  async listarAusencias(query: RangoAusenciasQueryDto) {
    const { ahora } = await this.contextoOrganizacion();
    const desde = query.desde
      ? new Date(`${query.desde.slice(0, 10)}T00:00:00Z`)
      : new Date(ahora.fechaSolo.getTime() - VENTANA_AUSENCIAS_PASADAS_DIAS * DIA_MS);
    const hasta = query.hasta
      ? new Date(`${query.hasta.slice(0, 10)}T00:00:00Z`)
      : new Date(ahora.fechaSolo.getTime() + VENTANA_AUSENCIAS_FUTURAS_DIAS * DIA_MS);
    return { hoy: fechaISO(ahora.fechaSolo), ausencias: await this.agruparAusencias(desde, hasta) };
  }

  // Arma la lista de ausencias agrupando jornadas AUSENTE seguidas de la
  // misma persona y el mismo motivo. Los días sin jornada (fin de semana
  // libre) no cortan el grupo; una jornada trabajada o programada sí.
  private async agruparAusencias(desde: Date, hasta: Date, staffIds?: string[]) {
    const db = this.prisma.extendedClient;
    const conAusencia: { staffId: string }[] = await db.turnoTrabajo.findMany({
      where: { estado: 'AUSENTE', fecha: { gte: desde, lte: hasta }, ...(staffIds ? { staffId: { in: staffIds } } : {}) },
      select: { staffId: true },
      distinct: ['staffId'],
    });
    if (conAusencia.length === 0) return [];

    const turnos: Array<{
      staffId: string;
      fecha: Date;
      estado: string;
      motivoAusencia: string | null;
      staff: { usuario: { nombreCompleto: string } | null } | null;
    }> = await db.turnoTrabajo.findMany({
      where: { staffId: { in: conAusencia.map((c) => c.staffId) }, fecha: { gte: desde, lte: hasta }, estado: { not: 'CANCELADO' } },
      select: { staffId: true, fecha: true, estado: true, motivoAusencia: true, staff: { select: { usuario: { select: { nombreCompleto: true } } } } },
      orderBy: [{ staffId: 'asc' }, { fecha: 'asc' }, { horaEntrada: 'asc' }],
    });

    const grupos: Array<{ staffId: string; staffNombre: string; desde: string; hasta: string; motivo: string; dias: number }> = [];
    let actual: (typeof grupos)[number] | null = null;
    for (const t of turnos) {
      const fecha = fechaISO(t.fecha);
      if (t.estado !== 'AUSENTE') {
        // Una jornada no ausente corta el grupo (salvo que sea otro bloque
        // del mismo día que ya está en el grupo: turno partido a medias).
        if (actual?.staffId === t.staffId && fecha !== actual.hasta) actual = null;
        continue;
      }
      const motivo = t.motivoAusencia ?? 'Sin motivo';
      if (actual && actual.staffId === t.staffId && actual.motivo === motivo) {
        if (fecha !== actual.hasta) {
          actual.hasta = fecha;
          actual.dias++;
        }
        continue;
      }
      actual = { staffId: t.staffId, staffNombre: t.staff?.usuario?.nombreCompleto ?? 'Sin nombre', desde: fecha, hasta: fecha, motivo, dias: 1 };
      grupos.push(actual);
    }
    return grupos.sort((a, b) => a.desde.localeCompare(b.desde) || a.staffNombre.localeCompare(b.staffNombre));
  }
}
