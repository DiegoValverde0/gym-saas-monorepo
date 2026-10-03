import { BadRequestException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { RedisClientType } from 'redis';
import { PrismaService } from '../../prisma/prisma.service';
import { aHoraLocal, ZONA_HORARIA_DEFAULT } from '../../common/utils/zona-horaria.util';
import { Promovido } from '../../common/utils/lista-espera.util';
import {
  cuandoEsLaClase,
  DIAS_AVISO_POR_VENCER,
  DIAS_AVISO_VENCIDA,
  TipoAviso,
  tipoDeNotificacion,
  textoAviso,
  textoWhatsapp,
  tipoNotificacion,
} from '../../common/utils/avisos.util';

const DIA_MS = 86_400_000;
// "Ya avisé" de la lista de WhatsApp: más que cualquier aviso de la lista.
const TTL_HECHO = 60 * 24 * 60 * 60;
// Eventos para la lista de WhatsApp ("ya tienes lugar", "se canceló tu clase"):
// después de estos días ya no interesan (y la clase ya pasó).
const TTL_EVENTOS = 15 * 24 * 60 * 60;

// Clave de un aviso de la lista de WhatsApp.
const CLAVE_AVISO_WHATSAPP = /^(por_vencer|vencida|lugar):[0-9a-f-]{36}$|^cancelada:[0-9a-f-]{36}:[0-9a-f-]{36}$/;

interface EventoClase {
  tipo: 'LUGAR' | 'CANCELADA';
  clienteId: string;
  clase: string;
  fechaHora: string;
  sucursal: string;
}

export interface AvisoWhatsapp {
  clave: string;
  tipo: TipoAviso;
  clienteId: string;
  cliente: string;
  telefono: string | null;
  tienePortal: boolean;
  resumen: string;
  mensaje: string;
}

// Orden de la lista: primero lo que tiene hora (clases), después lo que vence.
const ORDEN: Record<TipoAviso, number> = { CANCELADA: 0, LUGAR: 1, VENCE_HOY: 2, POR_VENCER: 3, VENCIDA: 4, RECORDATORIO: 5 };

/**
 * Avisos automáticos (docs/plan-avisos-automaticos.md) dentro de una
 * petición: los que salen en el acto (lista de espera, sesión cancelada), la
 * lista de WhatsApp de recepción y los avisos del portal. Los de cada hora
 * están en AvisosProgramadosService.
 */
@Injectable()
export class AvisosService {
  private readonly logger = new Logger(AvisosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    @Inject('REDIS_CLIENT') private readonly redis: RedisClientType,
  ) {}

  private organizacionId(): string {
    const id = this.cls.get('organizacionId');
    if (!id) throw new ForbiddenException('Selecciona una organización.');
    return id;
  }

  private async organizacion() {
    const org = await this.prisma.extendedClient.organizacion.findUnique({
      where: { id: this.organizacionId() },
      select: { nombre: true, zonaHoraria: true },
    });
    return { nombre: org?.nombre ?? 'tu gimnasio', zonaHoraria: org?.zonaHoraria ?? ZONA_HORARIA_DEFAULT };
  }

  // =========================================================================
  // EN EL ACTO: lista de espera y sesión cancelada
  // =========================================================================

  /** "¡Ya tienes lugar!" a quienes subieron de la lista de espera. Nunca rompe la acción que lo llamó. */
  async avisarLugar(claseId: string, promovidos: Promovido[]) {
    if (promovidos.length === 0) return;
    await this.avisarPorClase('LUGAR', claseId, promovidos.map((p) => ({ clienteId: p.clienteId, referencia: p.reservaId })));
  }

  /** "Se canceló tu clase" a quienes tenían reserva (confirmada o en espera). */
  async avisarClaseCancelada(claseId: string, clienteIds: string[]) {
    if (clienteIds.length === 0) return;
    await this.avisarPorClase('CANCELADA', claseId, clienteIds.map((clienteId) => ({ clienteId, referencia: `${claseId}:${clienteId}` })));
  }

  private async avisarPorClase(tipo: 'LUGAR' | 'CANCELADA', claseId: string, destinos: { clienteId: string; referencia: string }[]) {
    try {
      const db = this.prisma.extendedClient;
      const organizacionId = this.organizacionId();
      const [clase, org, clientes] = await Promise.all([
        db.claseProgramada.findUnique({ where: { id: claseId }, select: { nombreClase: true, fechaHora: true, sucursal: { select: { nombre: true } } } }),
        this.organizacion(),
        db.cliente.findMany({ where: { id: { in: destinos.map((d) => d.clienteId) } }, select: { id: true, usuarioId: true } }),
      ]);
      if (!clase) return;
      const { titulo, mensaje } = textoAviso(tipo, { clase: clase.nombreClase, cuando: cuandoEsLaClase(clase.fechaHora, org.zonaHoraria) });

      // Portal: solo quienes tienen cuenta.
      const cuentas = new Map(clientes.filter((c) => c.usuarioId).map((c) => [c.id, c.usuarioId as string]));
      const notificaciones = destinos
        .filter((d) => cuentas.has(d.clienteId))
        .map((d) => ({ usuarioDestinoId: cuentas.get(d.clienteId)!, tipo: tipoNotificacion(tipo, d.referencia.split(':')[0]), titulo, mensaje }));
      if (notificaciones.length > 0) {
        // organizacionId lo inyecta la extensión RLS.
        await db.notificacion.createMany({ data: notificaciones as never });
      }

      // Lista de WhatsApp: se anota ahora, porque después la reserva cancelada
      // o confirmada ya no dice que hubo un aviso pendiente.
      const clave = `avisos:eventos:${organizacionId}`;
      const multi = this.redis.multi();
      for (const d of destinos) {
        const evento: EventoClase = { tipo, clienteId: d.clienteId, clase: clase.nombreClase, fechaHora: clase.fechaHora.toISOString(), sucursal: clase.sucursal.nombre };
        multi.hSet(clave, `${tipo === 'LUGAR' ? 'lugar' : 'cancelada'}:${d.referencia}`, JSON.stringify(evento));
      }
      multi.expire(clave, TTL_EVENTOS);
      await multi.exec();
    } catch (err) {
      this.logger.error(`No se pudo avisar "${tipo}" de la clase ${claseId}: ${(err as Error).message}`);
    }
  }

  // =========================================================================
  // LISTA DE WHATSAPP (recepción)
  // =========================================================================

  async listaWhatsapp(): Promise<AvisoWhatsapp[]> {
    const db = this.prisma.extendedClient;
    const organizacionId = this.organizacionId();
    const org = await this.organizacion();
    const hoy = aHoraLocal(new Date(), org.zonaHoraria).fechaSolo;

    const [porVencer, vencidas, renovaciones, eventosGuardados] = await Promise.all([
      db.membresia.findMany({
        where: { estado: 'ACTIVA', fechaFin: { gte: hoy, lte: new Date(hoy.getTime() + DIAS_AVISO_POR_VENCER * DIA_MS) } },
        select: { id: true, clienteId: true, fechaFin: true, plan: { select: { nombre: true } } },
      }),
      db.membresia.findMany({
        where: { estado: 'VENCIDA', fechaFin: { gte: new Date(hoy.getTime() - DIAS_AVISO_VENCIDA * DIA_MS), lt: hoy } },
        select: { id: true, clienteId: true, fechaFin: true, plan: { select: { nombre: true } } },
      }),
      // Quien ya compró su siguiente membresía no necesita el aviso.
      db.membresia.findMany({ where: { estado: 'EN_ESPERA' }, select: { clienteId: true } }),
      this.redis.hGetAll(`avisos:eventos:${organizacionId}`),
    ]);

    const activas = await db.membresia.findMany({
      where: { estado: 'ACTIVA', clienteId: { in: vencidas.map((m) => m.clienteId) } },
      select: { clienteId: true },
    });
    const renovaron = new Set([...renovaciones, ...activas].map((m) => m.clienteId));

    type Candidato = Omit<AvisoWhatsapp, 'cliente' | 'telefono' | 'tienePortal' | 'mensaje'> & { datos: Parameters<typeof textoWhatsapp>[3] };
    const candidatos: Candidato[] = [];
    for (const m of porVencer) {
      if (renovaron.has(m.clienteId) || !m.fechaFin) continue;
      const dias = Math.round((m.fechaFin.getTime() - hoy.getTime()) / DIA_MS);
      candidatos.push({
        clave: `por_vencer:${m.id}`,
        tipo: dias === 0 ? 'VENCE_HOY' : 'POR_VENCER',
        clienteId: m.clienteId,
        resumen: dias === 0 ? `${m.plan.nombre} vence hoy` : `${m.plan.nombre} vence ${dias === 1 ? 'mañana' : `en ${dias} días`}`,
        datos: { plan: m.plan.nombre, fechaFin: m.fechaFin, diasRestantes: dias },
      });
    }
    for (const m of vencidas) {
      if (renovaron.has(m.clienteId) || !m.fechaFin) continue;
      candidatos.push({
        clave: `vencida:${m.id}`,
        tipo: 'VENCIDA',
        clienteId: m.clienteId,
        resumen: `${m.plan.nombre} venció el ${m.fechaFin.toISOString().slice(0, 10).split('-').reverse().join('/')}`,
        datos: { plan: m.plan.nombre, fechaFin: m.fechaFin },
      });
    }
    const ahora = new Date();
    // "Ya tienes lugar" solo mientras siga teniéndolo: si canceló o se canceló
    // la clase, ese mensaje ya no corresponde.
    const reservasLugar = Object.keys(eventosGuardados).filter((k) => k.startsWith('lugar:')).map((k) => k.slice('lugar:'.length));
    const siguenConLugar = new Set(
      reservasLugar.length
        ? (await db.reservaClase.findMany({ where: { id: { in: reservasLugar }, estado: 'CONFIRMADA' }, select: { id: true } })).map(
            (r: { id: string }) => `lugar:${r.id}`,
          )
        : [],
    );
    for (const [clave, valor] of Object.entries(eventosGuardados)) {
      const e = JSON.parse(valor) as EventoClase;
      const fechaHora = new Date(e.fechaHora);
      if (fechaHora <= ahora) continue; // la clase ya pasó
      if (e.tipo === 'LUGAR' && !siguenConLugar.has(clave)) continue;
      const cuando = cuandoEsLaClase(fechaHora, org.zonaHoraria);
      candidatos.push({
        clave,
        tipo: e.tipo,
        clienteId: e.clienteId,
        resumen: e.tipo === 'LUGAR' ? `Subió de la lista de espera: ${e.clase}, ${cuando}` : `Se canceló ${e.clase}, ${cuando}`,
        datos: { clase: e.clase, cuando, sucursal: e.sucursal },
      });
    }
    if (candidatos.length === 0) return [];

    // "Ya avisé" y alcance: con RLS, quien está limitado a una sucursal solo ve
    // a los clientes de esa sucursal (o sin sucursal).
    const [hechos, clientes] = await Promise.all([
      this.redis.mGet(candidatos.map((c) => `avisos:hecho:${organizacionId}:${c.clave}`)),
      db.cliente.findMany({
        where: { id: { in: [...new Set(candidatos.map((c) => c.clienteId))] } },
        select: { id: true, nombre: true, telefono: true, usuarioId: true },
      }),
    ]);
    type ClienteAviso = { id: string; nombre: string; telefono: string | null; usuarioId: string | null };
    const porId = new Map((clientes as ClienteAviso[]).map((c) => [c.id, c]));
    return candidatos
      .filter((c, i) => !hechos[i] && porId.has(c.clienteId))
      .map(({ datos, ...c }) => {
        const cliente = porId.get(c.clienteId)!;
        return {
          ...c,
          cliente: cliente.nombre,
          telefono: cliente.telefono,
          tienePortal: !!cliente.usuarioId,
          mensaje: textoWhatsapp(c.tipo, cliente.nombre, org.nombre, datos),
        };
      })
      .sort((a, b) => ORDEN[a.tipo] - ORDEN[b.tipo] || a.cliente.localeCompare(b.cliente));
  }

  async marcarHecho(clave: string) {
    if (!CLAVE_AVISO_WHATSAPP.test(clave)) throw new BadRequestException('Ese aviso no existe.');
    await this.redis.setEx(`avisos:hecho:${this.organizacionId()}:${clave}`, TTL_HECHO, new Date().toISOString());
    return { ok: true };
  }

  // =========================================================================
  // PORTAL DEL CLIENTE
  // =========================================================================

  async avisosDe(usuarioId: string) {
    const avisos = await this.prisma.extendedClient.notificacion.findMany({
      where: { usuarioDestinoId: usuarioId },
      select: { id: true, tipo: true, titulo: true, mensaje: true, fechaCreacion: true, fechaLectura: true },
      orderBy: { fechaCreacion: 'desc' },
      take: 50,
    });
    return avisos.map((a) => ({
      id: a.id,
      tipo: tipoDeNotificacion(a.tipo),
      titulo: a.titulo,
      mensaje: a.mensaje,
      fecha: a.fechaCreacion,
      leido: !!a.fechaLectura,
    }));
  }

  sinLeer(usuarioId: string) {
    return this.prisma.extendedClient.notificacion.count({ where: { usuarioDestinoId: usuarioId, fechaLectura: null } });
  }

  async marcarLeidos(usuarioId: string) {
    const { count } = await this.prisma.extendedClient.notificacion.updateMany({
      where: { usuarioDestinoId: usuarioId, fechaLectura: null },
      data: { fechaLectura: new Date() },
    });
    return { leidos: count };
  }
}
