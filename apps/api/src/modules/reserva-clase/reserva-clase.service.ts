import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReservaClaseDto } from './dto/create-reserva-clase.dto';
import { UpdateReservaClaseDto } from './dto/update-reserva-clase.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';
import { descontarSesionEnClase, evaluarReserva } from '../../common/utils/acceso-clases.util';
import { aHoraLocal } from '../../common/utils/zona-horaria.util';
import { promoverListaEspera } from '../../common/utils/lista-espera.util';
import { AvisosService } from '../avisos/avisos.service';

const INCLUDE_RESERVA = {
  clase: { select: { nombreClase: true, fechaHora: true } },
  cliente: { select: { nombre: true, numeroDocumento: true } },
} as const;

interface ClaseLockRow {
  id: string;
  estado: string;
  fechaHora: Date;
  capacidadMaxima: number;
  disciplinaId: string | null;
  nombreClase: string;
}

@Injectable()
export class ReservaClaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly avisos: AvisosService,
  ) {}

  private async datosOrganizacion() {
    const org = await this.prisma.extendedClient.organizacion.findUnique({
      where: { id: this.cls.get('organizacionId') },
      select: { configuracion: true, zonaHoraria: true },
    });
    return { configuracion: org?.configuracion ?? null, zonaHoraria: org?.zonaHoraria ?? null };
  }

  // Semáforo al buscar un cliente desde la sesión (plan 8.5): ¿puede reservar y,
  // si no, por qué? Mismas reglas que create().
  async puedeReservar(claseId: string, clienteId: string) {
    const clase = await this.prisma.extendedClient.claseProgramada.findUnique({
      where: { id: claseId },
      select: { id: true, disciplinaId: true, fechaHora: true, nombreClase: true, disciplina: { select: { nombre: true } } },
    });
    if (!clase) throw new NotFoundException('La clase no existe.');
    const { configuracion, zonaHoraria } = await this.datosOrganizacion();
    return evaluarReserva(this.prisma.extendedClient as unknown as Prisma.TransactionClient, clienteId, clase, configuracion, zonaHoraria);
  }

  // `forzar`: reservar aunque el plan no lo permita (recepción, con el permiso
  // asistencias:forzar, ver el controller). El cupo y la fecha se validan igual.
  async create(createReservaClaseDto: CreateReservaClaseDto, forzar = false) {
    const organizacionId = this.cls.get('organizacionId');
    if (!organizacionId) {
      throw new BadRequestException('No se puede reservar sin un tenant activo.');
    }
    const { configuracion, zonaHoraria } = await this.datosOrganizacion();

    return this.prisma.extendedClient.$transaction(async (tx) => {
      // SELECT ... FOR UPDATE bloquea la fila de la clase durante toda la
      // transacción, así dos reservas simultáneas para el último cupo quedan
      // serializadas (un simple count-then-create, sin este lock, permite que
      // ambas pasen la validación y se supere capacidadMaxima). Es una consulta
      // raw porque bypassa la extensión RLS/soft-delete, por eso filtramos
      // organizacionId y deletedAt a mano aquí.
      const clases = await tx.$queryRaw<ClaseLockRow[]>`
        SELECT id, estado, fecha_hora AS "fechaHora", capacidad_maxima AS "capacidadMaxima",
               disciplina_id AS "disciplinaId", nombre_clase AS "nombreClase"
        FROM clases_programadas
        WHERE id = ${createReservaClaseDto.claseId}::uuid
          AND organizacion_id = ${organizacionId}::uuid
          AND deleted_at IS NULL
        FOR UPDATE
      `;
      const clase = clases[0];

      if (!clase) {
        throw new BadRequestException('La clase especificada no existe.');
      }
      if (clase.estado !== 'ACTIVO') {
        throw new BadRequestException('Esta clase fue cancelada y ya no admite reservas.');
      }
      if (clase.fechaHora <= new Date()) {
        throw new BadRequestException('No se puede reservar una clase que ya pasó.');
      }

      // Quién puede reservar (plan 8.4): membresía vigente en la fecha de la
      // clase y plan permitido para la disciplina.
      if (!forzar) {
        const disciplina = clase.disciplinaId
          ? await tx.disciplina.findUnique({ where: { id: clase.disciplinaId }, select: { nombre: true } })
          : null;
        const evaluacion = await evaluarReserva(tx, createReservaClaseDto.clienteId, { ...clase, disciplina }, configuracion, zonaHoraria);
        if (!evaluacion.permitido) throw new BadRequestException(evaluacion.motivo);
      }

      // Hay una sola fila por cliente y clase (@@unique): si canceló antes, se
      // reutiliza esa fila en vez de crear otra.
      const previa = await tx.reservaClase.findFirst({
        where: { claseId: createReservaClaseDto.claseId, clienteId: createReservaClaseDto.clienteId },
        select: { id: true, estado: true },
      });
      if (previa && ['CONFIRMADA', 'ASISTIO', 'EN_ESPERA'].includes(previa.estado)) {
        throw new ConflictException(
          previa.estado === 'EN_ESPERA' ? 'Este cliente ya está en la lista de espera de esta clase.' : 'Este cliente ya tiene una reserva en esta clase.',
        );
      }

      // ASISTIO también ocupa cupo: si no, marcar asistencia liberaba lugares
      // y permitía sobrevender la clase.
      const cuposOcupados = await tx.reservaClase.count({
        where: { claseId: createReservaClaseDto.claseId, estado: { in: ['CONFIRMADA', 'ASISTIO'] } },
      });
      const llena = cuposOcupados >= clase.capacidadMaxima;
      if (llena && !createReservaClaseDto.listaEspera) {
        throw new ConflictException('Esta clase está llena. Puedes anotar al cliente en la lista de espera.');
      }

      // Con cupo libre se confirma aunque se haya pedido la lista de espera.
      const estado = llena ? 'EN_ESPERA' : 'CONFIRMADA';
      if (previa) {
        // fechaReserva nueva: en la lista de espera vuelve a quedar al final.
        return tx.reservaClase.update({
          where: { id: previa.id },
          data: { estado, fechaReserva: new Date() },
          include: INCLUDE_RESERVA,
        });
      }
      return tx.reservaClase.create({
        // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
        data: {
          claseId: createReservaClaseDto.claseId,
          clienteId: createReservaClaseDto.clienteId,
          estado,
        } as unknown as Prisma.ReservaClaseUncheckedCreateInput,
        include: INCLUDE_RESERVA,
      });
    });
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.reservaClase.findMany({
        include: INCLUDE_RESERVA,
        orderBy: { fechaReserva: 'desc' },
        skip,
        take,
      }),
      this.prisma.extendedClient.reservaClase.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const reserva = await this.prisma.extendedClient.reservaClase.findUnique({
      where: { id },
      include: INCLUDE_RESERVA,
    });
    if (!reserva) {
      throw new NotFoundException(`Reserva con ID ${id} no encontrada`);
    }
    return reserva;
  }

  async update(id: string, updateReservaClaseDto: UpdateReservaClaseDto) {
    const actual = await this.findOne(id);
    if (actual.estado === 'EN_ESPERA' && updateReservaClaseDto.estado !== 'CANCELADA') {
      throw new BadRequestException('Esta persona está en la lista de espera: todavía no tiene lugar en la clase.');
    }
    if (updateReservaClaseDto.estado === 'EN_ESPERA') {
      throw new BadRequestException('La lista de espera se asigna sola al reservar una clase llena.');
    }
    if (updateReservaClaseDto.estado === 'CANCELADA') return this.cancelar(id);
    const reserva = await this.prisma.extendedClient.reservaClase.update({
      where: { id },
      data: updateReservaClaseDto,
    });
    // Decisión D4: si la organización lo activó (experto), asistir a la clase
    // descuenta una sesión del plan por sesiones, igual que un ingreso.
    // Si se corrige una asistencia marcada por error, la sesión se devuelve.
    if (updateReservaClaseDto.estado === 'ASISTIO' && actual.estado !== 'ASISTIO') {
      await this.ajustarSesionSiCorresponde(reserva.clienteId, actual.clase.fechaHora, -1);
    } else if (actual.estado === 'ASISTIO' && updateReservaClaseDto.estado !== 'ASISTIO') {
      await this.ajustarSesionSiCorresponde(reserva.clienteId, actual.clase.fechaHora, +1);
    }
    return reserva;
  }

  // delta -1: descuenta una sesión; +1: la devuelve (y reactiva una membresía
  // que había quedado AGOTADA por esa sesión).
  private async ajustarSesionSiCorresponde(clienteId: string, fechaHora: Date, delta: 1 | -1) {
    const { configuracion, zonaHoraria } = await this.datosOrganizacion();
    if (!descontarSesionEnClase(configuracion)) return;
    const db = this.prisma.extendedClient;
    // Fecha "de reloj" de la clase, como se guardan fechaInicio/fechaFin.
    const fecha = aHoraLocal(fechaHora, zonaHoraria).fechaSolo;
    const membresia = await db.membresia.findFirst({
      where: {
        clienteId,
        ...(delta < 0 ? { estado: 'ACTIVA' as const, sesionesRestantes: { gt: 0 } } : { estado: { in: ['ACTIVA' as const, 'AGOTADA' as const] } }),
        plan: { tipoPlan: 'SESIONES' },
        fechaInicio: { lte: fecha },
        OR: [{ fechaFin: null }, { fechaFin: { gte: fecha } }],
      },
      orderBy: { fechaInicio: 'asc' },
    });
    if (!membresia) return;
    const actualizada = await db.membresia.update({ where: { id: membresia.id }, data: { sesionesRestantes: { increment: delta } } });
    // Mismo criterio que el control de acceso: sin sesiones, queda AGOTADA.
    if (actualizada.sesionesRestantes !== null && actualizada.sesionesRestantes <= 0) {
      await db.membresia.update({ where: { id: membresia.id }, data: { estado: 'AGOTADA' } });
    } else if (delta > 0 && actualizada.estado === 'AGOTADA') {
      await db.membresia.update({ where: { id: membresia.id }, data: { estado: 'ACTIVA' } });
    }
  }

  // Al cancelar una reserva confirmada se libera un cupo: sube el primero de
  // la lista de espera (fase 6, DB-3).
  // Quienes suben reciben el aviso "¡Ya tienes lugar!" (avisos automáticos).
  async cancelar(id: string) {
    const actual = await this.findOne(id);
    const { reserva, promovidos } = await this.prisma.extendedClient.$transaction(async (tx: Prisma.TransactionClient) => {
      const reserva = await tx.reservaClase.update({ where: { id }, data: { estado: 'CANCELADA' } });
      const promovidos = actual.estado === 'CONFIRMADA' ? await promoverListaEspera(tx, actual.claseId) : [];
      return { reserva, promovidos };
    });
    await this.avisos.avisarLugar(actual.claseId, promovidos);
    return { ...reserva, promovidos: promovidos.map((p) => p.nombre) };
  }
}
