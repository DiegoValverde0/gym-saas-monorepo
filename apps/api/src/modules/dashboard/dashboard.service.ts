import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { aHoraLocal, desdeHoraLocal } from '../../common/utils/zona-horaria.util';
import { promedioMismoDia, proyeccionDelMes, rangos, ultimosDias, variacion } from './indicadores';
import { asistenciasPorDia, ventasPorDia } from './series-diarias';
import { calcularSegmentoCliente, SEGMENTOS_CLIENTE } from '../clientes/segmentacion-cliente.util';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private cls: ClsService,
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
    };
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
