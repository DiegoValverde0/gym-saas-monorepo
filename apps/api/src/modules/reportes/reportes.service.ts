import { ForbiddenException, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { aHoraLocal, desdeHoraLocal } from '../../common/utils/zona-horaria.util';
import { RangoReporteDto } from './dto/rango-reporte.dto';

const DIA_MS = 24 * 60 * 60_000;
const TOLERANCIA_ATRASO_DEFAULT = 10;
const redondear = (n: number) => Math.round(n * 100) / 100;
const minutosDe = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();
const fechaISO = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Reportes por modo (plan de simplificación, 11.8). Todo se calcula en el
 * servidor y en la zona horaria de la organización (antes la pantalla sumaba
 * en el navegador la primera página de /transacciones con la fecha UTC).
 *  - Simple: resumen de hoy y de este mes comparado con el anterior.
 *  - Intermedio: ventas por plan, ocupación de clases y asistencia por día y hora.
 *  - Experto: horas, atrasos y costo del equipo.
 */
@Injectable()
export class ReportesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  private async contexto() {
    const organizacionId = this.cls.get('organizacionId');
    if (!organizacionId) throw new ForbiddenException('Selecciona una organización.');
    const org = await this.prisma.extendedClient.organizacion.findUnique({
      where: { id: organizacionId },
      select: { zonaHoraria: true, configuracion: true },
    });
    const zonaHoraria = org?.zonaHoraria ?? null;
    const hoy = aHoraLocal(new Date(), zonaHoraria).fechaSolo;
    const tolerancia = (org?.configuracion as { jornadas?: { toleranciaAtrasoMinutos?: unknown } } | null)?.jornadas?.toleranciaAtrasoMinutos;
    return { zonaHoraria, hoy, tolerancia: typeof tolerancia === 'number' ? tolerancia : TOLERANCIA_ATRASO_DEFAULT };
  }

  // Rango de fechas locales [desde, hasta] (ambas incluidas). Por defecto,
  // este mes hasta hoy.
  private rango(q: RangoReporteDto, hoy: Date) {
    const desde = q.desde ? new Date(`${q.desde.slice(0, 10)}T00:00:00Z`) : new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
    const hasta = q.hasta ? new Date(`${q.hasta.slice(0, 10)}T00:00:00Z`) : hoy;
    return { desde, hasta };
  }

  private instantes(desde: Date, hasta: Date, zonaHoraria: string | null) {
    return { gte: desdeHoraLocal(desde, 0, zonaHoraria), lt: desdeHoraLocal(new Date(hasta.getTime() + DIA_MS), 0, zonaHoraria) };
  }

  private async totales(sucursalId: string | undefined, rango: { gte: Date; lt: Date }) {
    const db = this.prisma.extendedClient;
    const suc = sucursalId ? { sucursalId } : {};
    const [pagos, gastos, membresias, asistencias, clientesNuevos, ventas] = await Promise.all([
      db.pago.findMany({
        where: { transaccion: { ...suc, tipo: 'INGRESO', deletedAt: null, fechaHora: rango } },
        select: { monto: true, metodoPago: true },
      }),
      db.transaccion.aggregate({ where: { ...suc, tipo: 'EGRESO', fechaHora: rango }, _sum: { montoTotal: true } }),
      db.membresia.count({ where: { ...(sucursalId ? { sucursalId } : {}), pagada: true, createdAt: rango } }),
      db.registroAsistencia.count({ where: { ...suc, fechaHoraIngreso: rango } }),
      db.cliente.count({ where: { ...(sucursalId ? { sucursalBaseId: sucursalId } : {}), createdAt: rango } }),
      db.transaccion.count({ where: { ...suc, tipo: 'INGRESO', fechaHora: rango } }),
    ]);
    const porFormaPago: Record<string, number> = {};
    let ingresos = 0;
    for (const p of pagos as Array<{ monto: Prisma.Decimal; metodoPago: string }>) {
      ingresos += Number(p.monto);
      porFormaPago[p.metodoPago] = redondear((porFormaPago[p.metodoPago] ?? 0) + Number(p.monto));
    }
    return {
      ingresos: redondear(ingresos),
      porFormaPago,
      ventas,
      gastos: redondear(Number(gastos._sum.montoTotal ?? 0)),
      membresiasVendidas: membresias,
      asistencias,
      clientesNuevos,
    };
  }

  // Simple: "Hoy" y "Este mes" frente al mismo tramo del mes anterior.
  async resumen(sucursalId?: string) {
    const { zonaHoraria, hoy } = await this.contexto();
    const inicioMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
    const inicioMesAnterior = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 1));
    // Mismo día del mes anterior (o el último, si ese mes es más corto).
    const finMesAnterior = new Date(Math.min(
      Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, hoy.getUTCDate()),
      inicioMes.getTime() - DIA_MS,
    ));
    const [deHoy, mes, mesAnterior] = await Promise.all([
      this.totales(sucursalId, this.instantes(hoy, hoy, zonaHoraria)),
      this.totales(sucursalId, this.instantes(inicioMes, hoy, zonaHoraria)),
      this.totales(sucursalId, this.instantes(inicioMesAnterior, finMesAnterior, zonaHoraria)),
    ]);
    return { fecha: fechaISO(hoy), hoy: deHoy, mes, mesAnterior, diasDelMes: hoy.getUTCDate() };
  }

  // Intermedio: membresías vendidas (pagadas) por plan.
  async planes(q: RangoReporteDto) {
    const { zonaHoraria, hoy } = await this.contexto();
    const { desde, hasta } = this.rango(q, hoy);
    const membresias: Array<{ montoFinal: Prisma.Decimal; plan: { id: string; nombre: string } }> = await this.prisma.extendedClient.membresia.findMany({
      where: { ...(q.sucursalId ? { sucursalId: q.sucursalId } : {}), pagada: true, createdAt: this.instantes(desde, hasta, zonaHoraria) },
      select: { montoFinal: true, plan: { select: { id: true, nombre: true } } },
    });
    const porPlan = new Map<string, { planId: string; plan: string; ventas: number; monto: number }>();
    for (const m of membresias) {
      const fila = porPlan.get(m.plan.id) ?? { planId: m.plan.id, plan: m.plan.nombre, ventas: 0, monto: 0 };
      fila.ventas++;
      fila.monto = redondear(fila.monto + Number(m.montoFinal));
      porPlan.set(m.plan.id, fila);
    }
    return { desde: fechaISO(desde), hasta: fechaISO(hasta), filas: [...porPlan.values()].sort((a, b) => b.monto - a.monto) };
  }

  // Intermedio: ocupación de las clases (sesiones del rango, agrupadas por nombre).
  async clases(q: RangoReporteDto) {
    const { zonaHoraria, hoy } = await this.contexto();
    const { desde, hasta } = this.rango(q, hoy);
    const sesiones: Array<{
      nombreClase: string;
      capacidadMaxima: number;
      disciplina: { nombre: string } | null;
      reservas: { estado: string }[];
    }> = await this.prisma.extendedClient.claseProgramada.findMany({
      where: { ...(q.sucursalId ? { sucursalId: q.sucursalId } : {}), estado: 'ACTIVO', fechaHora: this.instantes(desde, hasta, zonaHoraria) },
      select: { nombreClase: true, capacidadMaxima: true, disciplina: { select: { nombre: true } }, reservas: { select: { estado: true } } },
    });
    const porClase = new Map<string, { clase: string; disciplina: string | null; sesiones: number; cupos: number; reservas: number; asistieron: number }>();
    for (const s of sesiones) {
      const fila = porClase.get(s.nombreClase) ?? { clase: s.nombreClase, disciplina: s.disciplina?.nombre ?? null, sesiones: 0, cupos: 0, reservas: 0, asistieron: 0 };
      fila.sesiones++;
      fila.cupos += s.capacidadMaxima;
      fila.reservas += s.reservas.filter((r) => r.estado !== 'CANCELADA' && r.estado !== 'EN_ESPERA').length;
      fila.asistieron += s.reservas.filter((r) => r.estado === 'ASISTIO').length;
      porClase.set(s.nombreClase, fila);
    }
    const filas = [...porClase.values()].map((f) => ({ ...f, ocupacion: f.cupos ? Math.round((f.reservas / f.cupos) * 100) : 0 }));
    return { desde: fechaISO(desde), hasta: fechaISO(hasta), filas: filas.sort((a, b) => b.ocupacion - a.ocupacion) };
  }

  // Intermedio: ingresos al gimnasio por día de la semana y hora (mapa de calor).
  async asistencia(q: RangoReporteDto) {
    const { zonaHoraria, hoy } = await this.contexto();
    const { desde, hasta } = this.rango(q, hoy);
    const registros: { fechaHoraIngreso: Date }[] = await this.prisma.extendedClient.registroAsistencia.findMany({
      where: { ...(q.sucursalId ? { sucursalId: q.sucursalId } : {}), fechaHoraIngreso: this.instantes(desde, hasta, zonaHoraria) },
      select: { fechaHoraIngreso: true },
    });
    // matriz[diaSemana 0=domingo][hora 0..23]
    const matriz = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
    for (const r of registros) {
      const local = aHoraLocal(r.fechaHoraIngreso, zonaHoraria);
      matriz[local.fechaSolo.getUTCDay()][Math.floor(local.minutosDelDia / 60)]++;
    }
    return { desde: fechaISO(desde), hasta: fechaISO(hasta), total: registros.length, matriz };
  }

  // Experto: horas, atrasos y costo de cada persona del equipo (pendiente de
  // la fase 4). Horas trabajadas = entrada y salida marcadas; costo = horas
  // trabajadas × costo por hora.
  async equipo(q: RangoReporteDto) {
    const { hoy, zonaHoraria, tolerancia } = await this.contexto();
    const { desde, hasta } = this.rango(q, hoy);
    const jornadas: Array<{
      staffId: string;
      estado: string;
      horaEntrada: Date;
      horaSalida: Date;
      horaIngresoReal: Date | null;
      horaSalidaReal: Date | null;
      staff: { costoPorHora: Prisma.Decimal; usuario: { nombreCompleto: string } | null };
    }> = await this.prisma.extendedClient.turnoTrabajo.findMany({
      where: { ...(q.sucursalId ? { sucursalId: q.sucursalId } : {}), fecha: { gte: desde, lte: hasta } },
      select: {
        staffId: true,
        estado: true,
        horaEntrada: true,
        horaSalida: true,
        horaIngresoReal: true,
        horaSalidaReal: true,
        staff: { select: { costoPorHora: true, usuario: { select: { nombreCompleto: true } } } },
      },
    });

    const porPersona = new Map<string, {
      staffId: string; persona: string; costoPorHora: number; jornadas: number; horasProgramadas: number;
      horasTrabajadas: number; ausencias: number; sinMarcar: number; atrasos: number; minutosAtraso: number;
    }>();
    for (const j of jornadas) {
      const fila = porPersona.get(j.staffId) ?? {
        staffId: j.staffId, persona: j.staff.usuario?.nombreCompleto ?? 'Sin nombre', costoPorHora: Number(j.staff.costoPorHora),
        jornadas: 0, horasProgramadas: 0, horasTrabajadas: 0, ausencias: 0, sinMarcar: 0, atrasos: 0, minutosAtraso: 0,
      };
      porPersona.set(j.staffId, fila);
      if (j.estado === 'CANCELADO') continue;
      if (j.estado === 'AUSENTE') {
        fila.ausencias++;
        continue;
      }
      fila.jornadas++;
      fila.horasProgramadas += (minutosDe(j.horaSalida) - minutosDe(j.horaEntrada)) / 60;
      if (!j.horaIngresoReal) {
        fila.sinMarcar++;
        continue;
      }
      const llegada = aHoraLocal(j.horaIngresoReal, zonaHoraria).minutosDelDia;
      if (llegada > minutosDe(j.horaEntrada) + tolerancia) {
        fila.atrasos++;
        fila.minutosAtraso += llegada - minutosDe(j.horaEntrada);
      }
      if (j.horaSalidaReal) fila.horasTrabajadas += (j.horaSalidaReal.getTime() - j.horaIngresoReal.getTime()) / 3_600_000;
    }
    const filas = [...porPersona.values()].map((f) => ({
      ...f,
      horasProgramadas: redondear(f.horasProgramadas),
      horasTrabajadas: redondear(f.horasTrabajadas),
      costo: redondear(f.horasTrabajadas * f.costoPorHora),
    }));
    return { desde: fechaISO(desde), hasta: fechaISO(hasta), toleranciaAtrasoMinutos: tolerancia, filas: filas.sort((a, b) => a.persona.localeCompare(b.persona)) };
  }
}
