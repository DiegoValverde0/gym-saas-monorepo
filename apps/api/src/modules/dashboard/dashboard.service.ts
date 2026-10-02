import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { aHoraLocal, desdeHoraLocal } from '../../common/utils/zona-horaria.util';
import { promedioMismoDia, proyeccionDelMes, rangos, ultimosDias, variacion } from './indicadores';
import { asistenciasPorDia, ventasPorDia } from './series-diarias';
import { calcularSegmentoCliente, SEGMENTOS_CLIENTE } from '../clientes/segmentacion-cliente.util';
import { ReporteriaService } from '../reporteria/reporteria.service';
import { idDePlantilla } from '../reporteria/motor/plantillas';
import {
  ClaseProxima,
  elegirFrases,
  Frase,
  fraseCaja,
  fraseClase,
  fraseHoraPico,
  frasePorVencer,
  fraseRitmo,
  fraseSinVenir,
  fraseStock,
  horaMasLlena,
  vecesPorDiaDeSemana,
} from './para-saber';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private prisma: PrismaService,
    private cls: ClsService,
    private reporteria: ReporteriaService,
  ) {}

  private async zonaHoraria(): Promise<string | null> {
    const organizacionId = this.cls.get('organizacionId');
    if (!organizacionId) return null;
    const org = await this.prisma.extendedClient.organizacion.findUnique({ where: { id: organizacionId }, select: { zonaHoraria: true } });
    return org?.zonaHoraria ?? null;
  }

  /**
   * Indicadores del Inicio (docs/plan-inicio.md, fase 1): cada número con su
   * comparación "a la misma altura" y una serie chica para la tendencia. Las
   * fechas son las del gimnasio (antes "hoy" y "este mes" eran los del
   * servidor, y se contaba la fecha de carga de la venta, no la de la venta).
   */
  async getKpis(sucursalId?: string, { verIngresos = true }: { verIngresos?: boolean } = {}) {
    const zona = await this.zonaHoraria();
    const r = rangos(new Date(), zona);
    const db = this.prisma.extendedClient;
    const filtroVenta = { tipo: 'INGRESO' as const, ...(sucursalId ? { sucursalId } : {}) };
    const filtroCliente = sucursalId ? { sucursalBaseId: sucursalId } : {};
    const suma = async (desde: Date, hasta: Date) =>
      !verIngresos ? 0 : Number((await db.transaccion.aggregate({ where: { ...filtroVenta, fechaHora: { gte: desde, lt: hasta } }, _sum: { montoTotal: true } }))._sum.montoTotal ?? 0);

    const DIAS_SERIE_INGRESOS = 30;
    const DIAS_SERIE_ASISTENCIAS = 14;
    // Las tendencias terminan ayer: hoy va a medias y parecía una caída.
    const dias30 = ultimosDias(r, DIAS_SERIE_INGRESOS + 1).slice(0, -1);
    const desdeSerie = desdeHoraLocal(new Date(`${dias30[0]}T00:00:00Z`), 0, zona);
    // Asistencias: 4 semanas atrás para el promedio del mismo día de la semana.
    const desdeAsistencias = new Date(r.hoy.getTime() - 28 * 86_400_000);

    const organizacionId: string = this.cls.get('organizacionId');
    const filtroSerie = { organizacionId, sucursalId, zona };
    const fechaHoy = r.fechaHoy;
    const limiteVencer = new Date(fechaHoy.getTime() + 7 * 86_400_000);

    const [hoy, ayer, mes, mesPasado, mesPasadoCompleto, ventasPorDiaMapa, clientesTotales, clientesActivos, altasMes, altasMesPasado, asistenciasMapa, porVencer] =
      await Promise.all([
        suma(r.hoy, r.ahora),
        suma(r.ayer, r.ayerMismaHora),
        suma(r.mes, r.ahora),
        suma(r.mesPasado, r.mesPasadoMismaAltura),
        suma(r.mesPasado, r.mes),
        verIngresos ? ventasPorDia(db, { ...filtroSerie, desde: desdeSerie, hasta: r.ahora }) : new Map<string, number>(),
        db.cliente.count({ where: filtroCliente }),
        db.cliente.count({ where: { ...filtroCliente, membresias: { some: { estado: 'ACTIVA' } } } }),
        db.cliente.count({ where: { ...filtroCliente, createdAt: { gte: r.mes, lt: r.ahora } } }),
        db.cliente.count({ where: { ...filtroCliente, createdAt: { gte: r.mesPasado, lt: r.mesPasadoMismaAltura } } }),
        asistenciasPorDia(db, { ...filtroSerie, desde: desdeAsistencias, hasta: r.ahora, minutosDelDia: r.minutosDelDia }),
        // Membresías por vencer: el mismo criterio que la lista del Inicio
        // (getPorVencer: 7 días en la hora local, sin contar a quien ya renovó).
        db.membresia.count({
          where: {
            estado: 'ACTIVA',
            fechaFin: { gte: fechaHoy, lte: limiteVencer },
            cliente: { membresias: { none: { estado: 'EN_ESPERA' } }, ...(sucursalId ? { sucursalBaseId: sucursalId } : {}) },
          },
        }),
      ]);

    // Un gimnasio recién creado (sin ventas ni ingresos registrados) ve el
    // Inicio con datos de ejemplo (decisión I4).
    const [unaVenta, unaAsistencia] = await Promise.all([
      db.transaccion.findFirst({ where: { tipo: 'INGRESO' }, select: { id: true } }),
      db.registroAsistencia.findFirst({ select: { id: true } }),
    ]);
    const asistencias = asistenciasMapa as Map<string, { total: number; hastaLaHora: number }>;
    const hastaLaHora = new Map([...asistencias].map(([dia, x]) => [dia, x.hastaLaHora]));
    const claveHoy = fechaHoy.toISOString().slice(0, 10);
    const redondear = (n: number) => Math.round(n * 100) / 100;

    return {
      ingresos: !verIngresos ? null : {
        hoy: redondear(hoy),
        ayerMismaHora: redondear(ayer),
        mes: redondear(mes),
        mesPasadoMismaAltura: redondear(mesPasado),
        mesPasado: redondear(mesPasadoCompleto),
        variacionMes: variacion(mes, mesPasado),
        variacionHoy: variacion(hoy, ayer),
        proyeccionMes: proyeccionDelMes(mes, r),
        serie: dias30.map((fecha) => ({ fecha, valor: redondear((ventasPorDiaMapa as Map<string, number>).get(fecha) ?? 0) })),
      },
      asistencias: {
        hoy: asistencias.get(claveHoy)?.total ?? 0,
        promedioMismoDia: promedioMismoDia(hastaLaHora, r),
        serie: ultimosDias(r, DIAS_SERIE_ASISTENCIAS + 1).slice(0, -1).map((fecha) => ({ fecha, valor: asistencias.get(fecha)?.total ?? 0 })),
      },
      clientes: {
        activos: clientesActivos,
        totales: clientesTotales,
        altasMes,
        altasMesPasadoMismaAltura: altasMesPasado,
      },
      membresiasPorVencer: porVencer as number,
      conDatos: !!unaVenta || !!unaAsistencia,
    };
  }

  /**
   * "Lo que hay que saber hoy" (docs/plan-inicio.md, sección 4): cada regla mira
   * los datos y, si se cumple, propone una frase con su botón. Las que cuentan
   * lo mismo que una tarjeta corren su plantilla, así el número coincide. Las
   * del dinero (el ritmo del mes y la caja) son para quien administra el
   * gimnasio. Una regla que falla no deja sin las demás.
   */
  async getParaSaber(sucursalId?: string): Promise<{ frases: Frase[] }> {
    const ctx = await this.reporteria.contexto();
    const { organizacionId, zonaHoraria } = ctx.ejecucion;
    const puede = (p: string) => ctx.permisos.includes(p);
    const m = ctx.modulos;
    const administra = puede('organizaciones:actualizar');
    // El botón abre la plantilla; sin la reportería, la pantalla de siempre.
    const plantilla = (clave: string, sinReportes: string) => (puede('reportes:leer') ? `/dashboard/reporteria/${idDePlantilla(organizacionId, clave)}` : sinReportes);
    const hoy = ctx.ejecucion.hoy.toISOString().slice(0, 10);
    const db = this.prisma.extendedClient;
    // SQL directo: no pasa por la extensión RLS, así que filtra la organización a mano.
    const crudo = db as unknown as { $queryRaw<T>(query: Prisma.Sql): Promise<T> };
    const sucursal = (columna: string) => (sucursalId ? Prisma.sql` AND ${Prisma.raw(columna)} = ${sucursalId}::uuid` : Prisma.empty);

    const regla = async (nombre: string, fn: () => Promise<Frase | null>): Promise<Frase | null> => {
      try {
        return await fn();
      } catch (err) {
        this.logger.warn(`La regla "${nombre}" de "Lo que hay que saber hoy" falló: ${(err as Error).message}`);
        return null;
      }
    };
    const r = rangos(new Date(), zonaHoraria);
    // ¿El gimnasio registra los ingresos de sus clientes? Si no, "no vienen" no sería cierto.
    const hayAsistencias = async () => (await db.registroAsistencia.count({ where: { fechaHoraIngreso: { gte: new Date(r.hoy.getTime() - 30 * 86_400_000) } } })) > 0;

    const frases = await Promise.all([
      regla('ritmo del mes', async () => {
        if (!administra || !puede('transacciones:leer') || !m.puntoVenta) return null;
        const suma = async (desde: Date, hasta: Date) =>
          Number((await db.transaccion.aggregate({ where: { tipo: 'INGRESO', ...(sucursalId ? { sucursalId } : {}), fechaHora: { gte: desde, lt: hasta } }, _sum: { montoTotal: true } }))._sum.montoTotal ?? 0);
        const [mes, mesPasado] = await Promise.all([suma(r.mes, r.ahora), suma(r.mesPasado, r.mesPasadoMismaAltura)]);
        return fraseRitmo({ mes, mesPasado, diaDelMes: Number(hoy.slice(8, 10)), href: plantilla('ingresos-anio-vs-pasado', '/dashboard/transacciones') });
      }),
      regla('clientes sin venir', async () => {
        if (!m.controlAcceso || !(await hayAsistencias())) return null;
        const res = await this.reporteria.correrPlantilla('clientes-sin-venir-30', ctx);
        return res ? fraseSinVenir(res.totalFilas, plantilla('clientes-sin-venir-30', '/dashboard/clientes')) : null;
      }),
      regla('por vencer', async () => {
        if (!puede('membresias:leer')) return null;
        return frasePorVencer((await this.getPorVencer(sucursalId, 3)).length, '/dashboard/membresias');
      }),
      regla('hora pico', async () => {
        const res = await this.reporteria.correrPlantilla('horas-pico', ctx);
        if (!res) return null;
        const casillas = res.resumenes.filter((x) => x.nivel === 1 && x.conColumna).map((x) => ({ dia: String(x.grupo[0]), hora: Number(x.columna), cantidad: x.cantidad }));
        const total = res.resumenes.find((x) => x.nivel === 0 && !x.conColumna)?.cantidad ?? 0;
        const pico = horaMasLlena(casillas);
        // Los mismos 30 días que la plantilla (ultimos_30: de hace 29 días a hoy).
        const desde = new Date(ctx.ejecucion.hoy.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
        const hasta = new Date(ctx.ejecucion.hoy.getTime() + 86_400_000).toISOString().slice(0, 10);
        const semanas = pico ? (vecesPorDiaDeSemana(desde, hasta)[pico.dia] ?? 1) : 1;
        return fraseHoraPico(pico ? { ...pico, semanas } : null, total, plantilla('horas-pico', '/dashboard/asistencias'));
      }),
      regla('caja', async () => {
        if (!administra || !puede('aperturas_caja:leer') || !m.puntoVenta) return null;
        // El último turno cerrado de ayer o de hoy (en la hora del gimnasio).
        const desde = new Date(r.ayer.getTime());
        const filas = await crudo.$queryRaw<{ caja: string; fecha: string; diferencia: number }[]>(Prisma.sql`
          SELECT cj.nombre AS caja, to_char((ap.fecha_cierre AT TIME ZONE ${zonaHoraria})::date, 'YYYY-MM-DD') AS fecha,
                 (ap.monto_cierre_real - ap.monto_cierre_esperado)::float8 AS diferencia
          FROM aperturas_caja ap JOIN cajas_registradoras cj ON cj.id = ap.caja_id
          WHERE ap.organizacion_id = ${organizacionId}::uuid AND ap.estado = 'CERRADA' AND ap.fecha_cierre >= ${desde}
            AND ap.monto_cierre_real IS NOT NULL AND ap.monto_cierre_esperado IS NOT NULL${sucursal('cj.sucursal_id')}
          ORDER BY ap.fecha_cierre DESC LIMIT 1`);
        return fraseCaja(filas[0] ? { ...filas[0], diferencia: Number(filas[0].diferencia) } : null, hoy, plantilla('diferencias-caja-mes', '/dashboard/cajas'));
      }),
      regla('stock', async () => {
        const res = await this.reporteria.correrPlantilla('productos-reponer', ctx);
        return res ? fraseStock(res.totalFilas, plantilla('productos-reponer', '/dashboard/productos')) : null;
      }),
      regla('clases', async () => {
        if (!puede('clases:leer') || !m.clasesGrupales) return null;
        // Las sesiones que vienen en los próximos 7 días (las que ya empezaron, no).
        const hasta = new Date(r.hoy.getTime() + 8 * 86_400_000);
        const clases = await crudo.$queryRaw<(Omit<ClaseProxima, 'ocupados' | 'capacidad'> & { ocupados: number; capacidad: number })[]>(Prisma.sql`
          SELECT k.nombre_clase AS nombre, to_char(k.fecha_hora AT TIME ZONE ${zonaHoraria}, 'YYYY-MM-DD') AS fecha,
                 to_char(k.fecha_hora AT TIME ZONE ${zonaHoraria}, 'HH24:MI') AS hora, k.capacidad_maxima AS capacidad,
                 (SELECT count(*)::int FROM reservas_clases rc WHERE rc.clase_id = k.id AND rc.estado IN ('CONFIRMADA', 'ASISTIO')) AS ocupados
          FROM clases_programadas k
          WHERE k.organizacion_id = ${organizacionId}::uuid AND k.deleted_at IS NULL AND k.estado = 'ACTIVO'
            AND k.fecha_hora >= ${r.ahora} AND k.fecha_hora < ${hasta}${sucursal('k.sucursal_id')}
          ORDER BY k.fecha_hora LIMIT 200`);
        return fraseClase(clases.map((c) => ({ ...c, ocupados: Number(c.ocupados), capacidad: Number(c.capacidad) })), hoy, '/dashboard/agenda');
      }),
    ]);
    return { frases: elegirFrases(frases) };
  }

  // Reporte agregado para el Objetivo 1 de segmentación (ver
  // segmentacion-cliente.util.ts para la lógica de clasificación y las
  // decisiones de diseño detrás de cada balde). Trae solo lo mínimo por
  // cliente (id + membresías resumidas) y clasifica en memoria -- a escala
  // de un gimnasio (cientos/miles de clientes, no millones) es una sola
  // consulta liviana, no un problema de rendimiento.
  async getSegmentacionClientes(sucursalId?: string) {
    const clientes = await this.prisma.extendedClient.cliente.findMany({
      where: sucursalId ? { sucursalBaseId: sucursalId } : undefined,
      select: {
        id: true,
        membresias: { select: { estado: true, fechaInicio: true, fechaFin: true, pagada: true } },
      },
    });

    const conteos = Object.fromEntries(SEGMENTOS_CLIENTE.map((s) => [s, 0])) as Record<string, number>;
    for (const cliente of clientes) {
      conteos[calcularSegmentoCliente(cliente.membresias)]++;
    }

    return { total: clientes.length, porSegmento: conteos };
  }

  async getPorVencer(sucursalId?: string, dias = 7) {
    const organizacionId = this.cls.get('organizacionId');
    const org = organizacionId
      ? await this.prisma.extendedClient.organizacion.findUnique({ where: { id: organizacionId }, select: { zonaHoraria: true } })
      : null;
    const hoy = aHoraLocal(new Date(), org?.zonaHoraria).fechaSolo;
    const limite = new Date(hoy.getTime() + dias * 24 * 60 * 60_000);

    const membresias: Array<{
      clienteId: string;
      fechaFin: Date | null;
      plan: { nombre: string };
      cliente: { nombre: string; telefono: string | null; membresias: { id: string }[] };
    }> = await this.prisma.extendedClient.membresia.findMany({
      where: {
        estado: 'ACTIVA',
        fechaFin: { gte: hoy, lte: limite },
        ...(sucursalId ? { cliente: { sucursalBaseId: sucursalId } } : {}),
      },
      select: {
        clienteId: true,
        fechaFin: true,
        plan: { select: { nombre: true } },
        // Si ya tiene la siguiente membresía pagada en espera, ya renovó.
        cliente: { select: { nombre: true, telefono: true, membresias: { where: { estado: 'EN_ESPERA' }, select: { id: true } } } },
      },
      orderBy: { fechaFin: 'asc' },
    });

    return membresias
      .filter((m) => m.cliente.membresias.length === 0)
      .map((m) => ({
        clienteId: m.clienteId,
        cliente: m.cliente.nombre,
        telefono: m.cliente.telefono,
        plan: m.plan.nombre,
        fechaFin: m.fechaFin ? m.fechaFin.toISOString().slice(0, 10) : null,
        diasRestantes: m.fechaFin ? Math.round((m.fechaFin.getTime() - hoy.getTime()) / 86_400_000) : null,
      }));
  }

  async getRecentActivity(sucursalId?: string) {
    const recientes = await this.prisma.extendedClient.membresia.findMany({
      where: {
         cliente: sucursalId ? { sucursalBaseId: sucursalId } : undefined
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
          cliente: { select: { nombre: true } },
          plan: { select: { nombre: true } }
      }
    });

    return recientes;
  }
}
