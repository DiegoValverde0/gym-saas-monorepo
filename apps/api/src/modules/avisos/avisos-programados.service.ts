import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { aHoraLocal, ZONA_HORARIA_DEFAULT } from '../../common/utils/zona-horaria.util';
import {
  cuandoEsLaClase,
  DIAS_AVISO_POR_VENCER,
  DIAS_AVISO_VENCIDA,
  HORAS_RECORDATORIO,
  TipoAviso,
  textoAviso,
  tipoNotificacion,
} from '../../common/utils/avisos.util';

const DIA_MS = 86_400_000;
// Los avisos de membresía no salen de madrugada: desde las 7:00 del gimnasio.
const HORA_AVISOS_MEMBRESIA = 7;

interface NuevoAviso {
  organizacionId: string;
  usuarioDestinoId: string;
  tipo: string;
  titulo: string;
  mensaje: string;
}

/**
 * Avisos del portal que salen solos (docs/plan-avisos-automaticos.md):
 * membresía por vencer, vence hoy, vencida y recordatorio de clase. Corre
 * cada hora y es idempotente: cada aviso lleva en `tipo` la membresía o la
 * reserva a la que se refiere, y no se vuelve a crear si ya existe.
 *
 * Recorre todas las organizaciones sin contexto de tenant, así que usa el
 * cliente crudo de Prisma a propósito (ver excludedFiles en .eslintrc.js) y
 * filtra organizacionId y deletedAt a mano en cada consulta.
 */
@Injectable()
export class AvisosProgramadosService {
  private readonly logger = new Logger(AvisosProgramadosService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleAvisosProgramados() {
    const organizaciones = await this.prisma.organizacion.findMany({
      where: { deletedAt: null, estado: 'ACTIVO' },
      select: { id: true, zonaHoraria: true },
    });
    for (const org of organizaciones) {
      try {
        const creados = await this.generarAvisos(org.id, org.zonaHoraria ?? ZONA_HORARIA_DEFAULT);
        if (creados > 0) this.logger.log(`Organización ${org.id}: ${creados} avisos nuevos en el portal.`);
      } catch (err) {
        this.logger.error(`Fallo al generar los avisos de ${org.id}: ${(err as Error).message}`);
      }
    }
  }

  /** Crea los avisos que falten. Devuelve cuántos creó. */
  async generarAvisos(organizacionId: string, zonaHoraria: string, ahora = new Date()): Promise<number> {
    const local = aHoraLocal(ahora, zonaHoraria);
    const candidatos: NuevoAviso[] = [
      ...(local.minutosDelDia >= HORA_AVISOS_MEMBRESIA * 60 ? await this.avisosDeMembresias(organizacionId, local.fechaSolo) : []),
      ...(await this.recordatoriosDeClases(organizacionId, zonaHoraria, ahora)),
    ];
    if (candidatos.length === 0) return 0;

    const existentes = await this.prisma.notificacion.findMany({
      where: { organizacionId, tipo: { in: candidatos.map((c) => c.tipo) } },
      select: { tipo: true, usuarioDestinoId: true },
    });
    const ya = new Set(existentes.map((e) => `${e.usuarioDestinoId}|${e.tipo}`));
    const nuevos = candidatos.filter((c) => !ya.has(`${c.usuarioDestinoId}|${c.tipo}`));
    if (nuevos.length > 0) await this.prisma.notificacion.createMany({ data: nuevos });
    return nuevos.length;
  }

  // Por vencer (3 días antes), vence hoy y vencida (los 3 días después), solo
  // a clientes con portal y sin una membresía siguiente ya comprada.
  private async avisosDeMembresias(organizacionId: string, hoy: Date): Promise<NuevoAviso[]> {
    const conPortal = { deletedAt: null, usuarioId: { not: null } };
    const [porVencer, vencidas] = await Promise.all([
      this.prisma.membresia.findMany({
        where: {
          organizacionId,
          deletedAt: null,
          estado: 'ACTIVA',
          fechaFin: { gte: hoy, lte: new Date(hoy.getTime() + DIAS_AVISO_POR_VENCER * DIA_MS) },
          cliente: conPortal,
        },
        select: { id: true, clienteId: true, fechaFin: true, plan: { select: { nombre: true } }, cliente: { select: { usuarioId: true } } },
      }),
      this.prisma.membresia.findMany({
        where: {
          organizacionId,
          deletedAt: null,
          estado: 'VENCIDA',
          fechaFin: { gte: new Date(hoy.getTime() - DIAS_AVISO_VENCIDA * DIA_MS), lt: hoy },
          cliente: conPortal,
        },
        select: { id: true, clienteId: true, fechaFin: true, plan: { select: { nombre: true } }, cliente: { select: { usuarioId: true } } },
      }),
    ]);
    if (porVencer.length === 0 && vencidas.length === 0) return [];

    // Renovó: tiene una membresía por empezar, o (si la otra venció) una activa.
    const siguientes = await this.prisma.membresia.findMany({
      where: {
        organizacionId,
        deletedAt: null,
        clienteId: { in: [...porVencer, ...vencidas].map((m) => m.clienteId) },
        OR: [{ estado: 'EN_ESPERA' }, { estado: 'ACTIVA', clienteId: { in: vencidas.map((m) => m.clienteId) } }],
      },
      select: { clienteId: true },
    });
    const renovaron = new Set(siguientes.map((m) => m.clienteId));

    const avisos: NuevoAviso[] = [];
    for (const m of porVencer) {
      if (renovaron.has(m.clienteId) || !m.fechaFin || !m.cliente.usuarioId) continue;
      const dias = Math.round((m.fechaFin.getTime() - hoy.getTime()) / DIA_MS);
      const tipo: TipoAviso = dias === 0 ? 'VENCE_HOY' : 'POR_VENCER';
      avisos.push({
        organizacionId,
        usuarioDestinoId: m.cliente.usuarioId,
        tipo: tipoNotificacion(tipo, m.id),
        ...textoAviso(tipo, { plan: m.plan.nombre, fechaFin: m.fechaFin, diasRestantes: dias }),
      });
    }
    for (const m of vencidas) {
      if (renovaron.has(m.clienteId) || !m.fechaFin || !m.cliente.usuarioId) continue;
      avisos.push({
        organizacionId,
        usuarioDestinoId: m.cliente.usuarioId,
        tipo: tipoNotificacion('VENCIDA', m.id),
        ...textoAviso('VENCIDA', { plan: m.plan.nombre, fechaFin: m.fechaFin }),
      });
    }
    return avisos;
  }

  // Clases reservadas que empiezan en las próximas 3 horas.
  private async recordatoriosDeClases(organizacionId: string, zonaHoraria: string, ahora: Date): Promise<NuevoAviso[]> {
    const reservas = await this.prisma.reservaClase.findMany({
      where: {
        organizacionId,
        estado: 'CONFIRMADA',
        clase: { deletedAt: null, estado: 'ACTIVO', fechaHora: { gt: ahora, lte: new Date(ahora.getTime() + HORAS_RECORDATORIO * 3_600_000) } },
        cliente: { deletedAt: null, usuarioId: { not: null } },
      },
      select: {
        id: true,
        cliente: { select: { usuarioId: true } },
        clase: { select: { nombreClase: true, fechaHora: true, sucursal: { select: { nombre: true } } } },
      },
    });
    return reservas.map((r) => ({
      organizacionId,
      usuarioDestinoId: r.cliente.usuarioId as string,
      tipo: tipoNotificacion('RECORDATORIO', r.id),
      ...textoAviso('RECORDATORIO', { clase: r.clase.nombreClase, cuando: cuandoEsLaClase(r.clase.fechaHora, zonaHoraria, ahora), sucursal: r.clase.sucursal.nombre }),
    }));
  }
}
