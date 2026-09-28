import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { ReservaClaseService } from '../reserva-clase/reserva-clase.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';
import { aHoraLocal } from '../../common/utils/zona-horaria.util';
import { moduloEstaActivo } from '../../common/utils/modulo.util';
import { hashContrasena, verificarHash } from '../../common/utils/contrasena.util';
import {
  decidirReserva,
  EvaluacionReserva,
  leerAccesoClases,
  ReglaAccesoClase,
  reglaDeDisciplina,
} from '../../common/utils/acceso-clases.util';

// Clases que se muestran en el portal: desde ahora hasta 2 semanas.
const DIAS_CLASES = 14;
const DIA_MS = 86_400_000;

// ReservaClaseService habla a recepción ("Este cliente..."); en el portal
// el mensaje es para el propio cliente.
const MENSAJES_PORTAL: Record<string, string> = {
  'Este cliente ya está en la lista de espera de esta clase.': 'Ya estás en la lista de espera de esta clase.',
  'Este cliente ya tiene una reserva en esta clase.': 'Ya tienes una reserva en esta clase.',
  'Esta clase está llena. Puedes anotar al cliente en la lista de espera.': 'Esta clase está llena. Puedes anotarte en la lista de espera.',
};

const ESTADOS_OCUPAN_CUPO = ['CONFIRMADA', 'ASISTIO'];

/**
 * Portal del cliente: todo se lee y se cambia sobre la ficha de quien entra
 * (clienteId que dejó PortalClienteGuard en el contexto), nunca sobre un id
 * que mande el navegador.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly reservas: ReservaClaseService,
  ) {}

  private clienteId(): string {
    const id = this.cls.get('clienteId');
    if (!id) throw new ForbiddenException('El portal es solo para clientes del gimnasio.');
    return id;
  }

  private async organizacion() {
    const org = await this.prisma.extendedClient.organizacion.findUnique({
      where: { id: this.cls.get('organizacionId') },
      select: { id: true, nombre: true, configuracion: true, zonaHoraria: true },
    });
    if (!org) throw new ForbiddenException('Organización no encontrada.');
    return org;
  }

  private async assertClasesActivas(organizacionId: string) {
    if (!(await moduloEstaActivo(this.prisma, organizacionId, 'clasesGrupales'))) {
      throw new ForbiddenException('Este gimnasio no ofrece reservas de clases en línea.');
    }
  }

  // Inicio del portal: quién soy, mi membresía y mis próximas clases.
  async yo() {
    const db = this.prisma.extendedClient;
    const clienteId = this.clienteId();
    const org = await this.organizacion();
    const hoy = aHoraLocal(new Date(), org.zonaHoraria).fechaSolo;

    const [cliente, membresias, reservas, clasesActivas] = await Promise.all([
      // El correo que se muestra es el de la cuenta (con el que entra), no el de la ficha.
      db.cliente.findUnique({ where: { id: clienteId }, select: { nombre: true, usuario: { select: { correo: true } } } }),
      db.membresia.findMany({
        where: { clienteId, estado: { not: 'CANCELADA' } },
        include: { plan: { select: { nombre: true, tipoPlan: true } } },
        orderBy: { fechaInicio: 'desc' },
        take: 10,
      }),
      db.reservaClase.findMany({
        where: { clienteId, estado: { in: ['CONFIRMADA', 'EN_ESPERA'] }, clase: { fechaHora: { gte: new Date() }, estado: 'ACTIVO' } },
        select: {
          id: true,
          estado: true,
          clase: { select: { id: true, nombreClase: true, fechaHora: true, duracionMinutos: true, sucursal: { select: { nombre: true } } } },
        },
        orderBy: { clase: { fechaHora: 'asc' } },
        take: 5,
      }),
      moduloEstaActivo(this.prisma, org.id, 'clasesGrupales'),
    ]);

    // La que corre hoy; si no hay, la pausada, la que empieza pronto o la
    // última (vencida, agotada o por pagar) para decirle qué pasó.
    type M = (typeof membresias)[number];
    const vigente = membresias.find((m: M) => m.estado === 'ACTIVA' && m.fechaInicio <= hoy && (!m.fechaFin || m.fechaFin >= hoy));
    const congelada = membresias.find((m: M) => m.estado === 'CONGELADA');
    const enEspera = membresias
      .filter((m: M) => m.estado === 'EN_ESPERA')
      .sort((a: M, b: M) => a.fechaInicio.getTime() - b.fechaInicio.getTime())[0];
    const actual = vigente ?? congelada ?? enEspera ?? membresias[0] ?? null;

    return {
      nombre: cliente?.nombre ?? '',
      correo: cliente?.usuario?.correo ?? null,
      gimnasio: org.nombre,
      clasesActivas,
      membresia: actual
        ? {
            planNombre: actual.plan.nombre,
            tipoPlan: actual.plan.tipoPlan,
            estado: actual.estado,
            fechaInicio: actual.fechaInicio.toISOString().slice(0, 10),
            fechaFin: actual.fechaFin ? actual.fechaFin.toISOString().slice(0, 10) : null,
            diasRestantes: actual.fechaFin ? Math.max(0, Math.round((actual.fechaFin.getTime() - hoy.getTime()) / DIA_MS)) : null,
            sesionesRestantes: actual.plan.tipoPlan === 'SESIONES' ? actual.sesionesRestantes : null,
          }
        : null,
      // La próxima renovación ya comprada, para "Tu siguiente plan empieza el...".
      siguiente: vigente && enEspera ? { planNombre: enEspera.plan.nombre, fechaInicio: enEspera.fechaInicio.toISOString().slice(0, 10) } : null,
      proximasClases: clasesActivas
        ? reservas.map((r) => ({
            reservaId: r.id,
            estado: r.estado,
            claseId: r.clase.id,
            nombre: r.clase.nombreClase,
            fechaHora: r.clase.fechaHora,
            duracionMinutos: r.clase.duracionMinutos,
            sucursal: r.clase.sucursal.nombre,
          }))
        : [],
    };
  }

  // Historial de membresías y de pagos.
  async membresias() {
    const db = this.prisma.extendedClient;
    const clienteId = this.clienteId();
    const [membresias, transacciones] = await Promise.all([
      db.membresia.findMany({
        where: { clienteId },
        include: { plan: { select: { nombre: true, tipoPlan: true } } },
        orderBy: { fechaInicio: 'desc' },
        take: 50,
      }),
      db.transaccion.findMany({
        where: { clienteId, tipo: 'INGRESO' },
        select: {
          id: true,
          fechaHora: true,
          montoTotal: true,
          pagos: { select: { metodoPago: true } },
          detalles: { select: { tipoConcepto: true, descripcionLibre: true, membresia: { select: { plan: { select: { nombre: true } } } } } },
        },
        orderBy: { fechaHora: 'desc' },
        take: 50,
      }),
    ]);
    return {
      membresias: membresias.map((m) => ({
        id: m.id,
        planNombre: m.plan.nombre,
        tipoPlan: m.plan.tipoPlan,
        estado: m.estado,
        fechaInicio: m.fechaInicio.toISOString().slice(0, 10),
        fechaFin: m.fechaFin ? m.fechaFin.toISOString().slice(0, 10) : null,
        sesionesRestantes: m.plan.tipoPlan === 'SESIONES' ? m.sesionesRestantes : null,
        monto: Number(m.montoFinal),
        pagada: m.pagada,
      })),
      pagos: transacciones.map((t) => ({
        id: t.id,
        fechaHora: t.fechaHora,
        monto: Number(t.montoTotal),
        formasPago: [...new Set(t.pagos.map((p) => p.metodoPago))],
        concepto: t.detalles
          .map((d) => d.descripcionLibre || (d.membresia ? `Membresía ${d.membresia.plan.nombre}` : d.tipoConcepto))
          .join(', '),
      })),
    };
  }

  async asistencias(query?: PaginationQueryDto) {
    const db = this.prisma.extendedClient;
    const clienteId = this.clienteId();
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      db.registroAsistencia.findMany({
        where: { clienteId },
        select: { id: true, fechaHoraIngreso: true, fechaHoraSalida: true, sucursal: { select: { nombre: true } } },
        orderBy: { fechaHoraIngreso: 'desc' },
        skip,
        take,
      }),
      db.registroAsistencia.count({ where: { clienteId } }),
    ]);
    return paginar(
      data.map((a) => ({ id: a.id, ingreso: a.fechaHoraIngreso, salida: a.fechaHoraSalida, sucursal: a.sucursal.nombre })),
      total,
      page,
      limit,
    );
  }

  /**
   * Clases de las próximas 2 semanas con cupos libres, mi reserva (si tengo)
   * y si puedo reservar y, si no, por qué. Evalúa todas las clases con las
   * mismas reglas que recepción (decidirReserva) pero con pocas consultas.
   */
  async clases() {
    const org = await this.organizacion();
    await this.assertClasesActivas(org.id);
    const ahora = new Date();
    return this.listarClases(org, { fechaHora: { gt: ahora, lte: new Date(ahora.getTime() + DIAS_CLASES * DIA_MS) } });
  }

  // Solo clases activas que todavía no empezaron.
  private async listarClases(
    org: { configuracion: unknown; zonaHoraria: string | null },
    filtro: { id?: string; fechaHora?: { gt: Date; lte: Date } },
  ) {
    const db = this.prisma.extendedClient;
    const clienteId = this.clienteId();
    const clases = await db.claseProgramada.findMany({
      where: { estado: 'ACTIVO', fechaHora: { gt: new Date() }, ...filtro },
      select: {
        id: true,
        nombreClase: true,
        descripcion: true,
        fechaHora: true,
        duracionMinutos: true,
        capacidadMaxima: true,
        disciplinaId: true,
        acceso: true,
        clasePlantillaId: true,
        disciplina: { select: { nombre: true } },
        sucursal: { select: { id: true, nombre: true } },
        sala: { select: { nombre: true } },
        entrenador: { select: { usuario: { select: { nombreCompleto: true } } } },
      },
      orderBy: { fechaHora: 'asc' },
      take: 300,
    });
    const ids = clases.map((c) => c.id);
    const plantillasConPlanes = [...new Set(clases.filter((c) => c.acceso === 'PLANES' && c.clasePlantillaId).map((c) => c.clasePlantillaId as string))];

    const [cliente, membresias, reservas, planesDePlantilla] = await Promise.all([
      db.cliente.findUnique({ where: { id: clienteId }, select: { nombre: true } }),
      db.membresia.findMany({
        where: { clienteId, estado: { in: ['ACTIVA', 'EN_ESPERA'] } },
        select: { id: true, planId: true, fechaInicio: true, fechaFin: true, plan: { select: { nombre: true } } },
      }),
      ids.length
        ? db.reservaClase.findMany({
            where: { claseId: { in: ids }, estado: { in: ['CONFIRMADA', 'ASISTIO', 'EN_ESPERA'] } },
            select: { id: true, claseId: true, clienteId: true, estado: true, fechaReserva: true },
            orderBy: { fechaReserva: 'asc' },
          })
        : [],
      plantillasConPlanes.length
        ? db.clasePlantillaPlan.findMany({ where: { clasePlantillaId: { in: plantillasConPlanes } }, select: { clasePlantillaId: true, planId: true } })
        : [],
    ]);

    const accesoClases = leerAccesoClases(org.configuracion);
    const reservasPorClase = new Map<string, typeof reservas>();
    for (const r of reservas) {
      const lista = reservasPorClase.get(r.claseId) ?? [];
      lista.push(r);
      reservasPorClase.set(r.claseId, lista);
    }

    return clases.map((c) => {
      const deLaClase = reservasPorClase.get(c.id) ?? [];
      const ocupados = deLaClase.filter((r) => ESTADOS_OCUPAN_CUPO.includes(r.estado)).length;
      const mia = deLaClase.find((r) => r.clienteId === clienteId) ?? null;
      const enEspera = deLaClase.filter((r) => r.estado === 'EN_ESPERA');

      // Misma regla que reglaPropiaDeSesion + reglaDeDisciplina.
      const regla: ReglaAccesoClase = c.acceso
        ? c.acceso === 'PLANES'
          ? { modo: 'PLANES', planIds: planesDePlantilla.filter((p) => p.clasePlantillaId === c.clasePlantillaId).map((p) => p.planId) }
          : { modo: c.acceso }
        : reglaDeDisciplina(accesoClases, c.disciplinaId);
      const clasesDe = c.acceso ? c.nombreClase : c.disciplina?.nombre ?? c.nombreClase;
      const evaluacion: EvaluacionReserva = decidirReserva(
        regla,
        membresias,
        aHoraLocal(c.fechaHora, org.zonaHoraria).fechaSolo,
        cliente?.nombre ?? '',
        clasesDe,
        'segunda',
      );

      return {
        id: c.id,
        nombre: c.nombreClase,
        descripcion: c.descripcion,
        disciplina: c.disciplina?.nombre ?? null,
        fechaHora: c.fechaHora,
        duracionMinutos: c.duracionMinutos,
        sucursal: c.sucursal.nombre,
        sala: c.sala?.nombre ?? null,
        instructor: c.entrenador?.usuario.nombreCompleto ?? null,
        capacidad: c.capacidadMaxima,
        cuposLibres: Math.max(0, c.capacidadMaxima - ocupados),
        enEspera: enEspera.length,
        miReserva: mia
          ? {
              id: mia.id,
              estado: mia.estado,
              // 1 = primero en la lista de espera.
              posicionEspera: mia.estado === 'EN_ESPERA' ? enEspera.findIndex((r) => r.id === mia.id) + 1 : null,
            }
          : null,
        puedeReservar: evaluacion.permitido,
        motivo: evaluacion.motivo,
      };
    });
  }

  async reservar(claseId: string, listaEspera = false) {
    const org = await this.organizacion();
    await this.assertClasesActivas(org.id);

    // Primero con el texto para el cliente; ReservaClaseService vuelve a
    // validar todo dentro de la transacción (cupo, reserva previa, reglas).
    const [clase] = await this.listarClases(org, { id: claseId });
    if (!clase) throw new NotFoundException('Esta clase ya no está disponible.');
    if (!clase.puedeReservar) throw new BadRequestException(clase.motivo ?? 'No puedes reservar esta clase.');

    try {
      const reserva = await this.reservas.create({ claseId, clienteId: this.clienteId(), listaEspera });
      return { id: reserva.id, estado: reserva.estado };
    } catch (err: unknown) {
      const traducido = err instanceof ConflictException ? MENSAJES_PORTAL[err.message] : undefined;
      throw traducido ? new ConflictException(traducido) : err;
    }
  }

  async cancelar(reservaId: string) {
    const db = this.prisma.extendedClient;
    const reserva = await db.reservaClase.findFirst({
      where: { id: reservaId, clienteId: this.clienteId() },
      select: { id: true, estado: true, clase: { select: { fechaHora: true } } },
    });
    if (!reserva) throw new NotFoundException('No encontramos esa reserva.');
    if (!['CONFIRMADA', 'EN_ESPERA'].includes(reserva.estado)) {
      throw new BadRequestException('Esta reserva ya no se puede cancelar.');
    }
    if (reserva.clase.fechaHora <= new Date()) {
      throw new BadRequestException('La clase ya empezó: no se puede cancelar.');
    }
    const resultado = await this.reservas.cancelar(reserva.id);
    return { id: resultado.id, estado: resultado.estado };
  }

  // Cambiar la contraseña temporal que le dieron en recepción.
  async cambiarContrasena(usuarioId: string, actual: string, nueva: string) {
    const usuario = await this.prisma.extendedClient.usuario.findUnique({ where: { id: usuarioId }, select: { contrasenaHash: true } });
    if (!usuario || !(await verificarHash(actual, usuario.contrasenaHash))) {
      throw new BadRequestException('La contraseña actual no es correcta.');
    }
    if (actual === nueva) throw new BadRequestException('La contraseña nueva tiene que ser distinta de la actual.');
    await this.prisma.extendedClient.usuario.update({ where: { id: usuarioId }, data: { contrasenaHash: await hashContrasena(nueva) } });
    return { ok: true };
  }
}
