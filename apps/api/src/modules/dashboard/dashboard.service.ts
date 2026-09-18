import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { startOfDay, startOfMonth, subDays, format } from 'date-fns';
import { calcularSegmentoCliente, SEGMENTOS_CLIENTE } from '../clientes/segmentacion-cliente.util';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getKpis(sucursalId?: string) {
    const today = startOfDay(new Date());
    const thisMonth = startOfMonth(new Date());
    
    // Filtro de sucursal
    const filterTransaccion = sucursalId ? { sucursalId } : {};
    const filterCliente = sucursalId ? { sucursalBaseId: sucursalId } : {};
    const filterAsistencia = sucursalId ? { sucursalId } : {};

    // 1. Ingresos
    const ingresosHoy = await this.prisma.extendedClient.transaccion.aggregate({
      where: { ...filterTransaccion, tipo: 'INGRESO', createdAt: { gte: today } },
      _sum: { montoTotal: true }
    });

    const ingresosMes = await this.prisma.extendedClient.transaccion.aggregate({
      where: { ...filterTransaccion, tipo: 'INGRESO', createdAt: { gte: thisMonth } },
      _sum: { montoTotal: true }
    });

    // 2. Clientes
    const clientesTotales = await this.prisma.extendedClient.cliente.count({
      where: filterCliente
    });

    const clientesActivos = await this.prisma.extendedClient.cliente.count({
      where: {
        ...filterCliente,
        membresias: {
          some: {
            estado: 'ACTIVA'
          }
        }
      }
    });

    // 3. Asistencias Hoy
    const asistenciasHoy = await this.prisma.extendedClient.registroAsistencia.count({
      where: {
        ...filterAsistencia,
        fechaHoraIngreso: { gte: today }
      }
    });

    // 4. Membresías por vencer (próximos 5 días)
    const next5Days = new Date();
    next5Days.setDate(next5Days.getDate() + 5);
    
    const membresiasPorVencer = await this.prisma.extendedClient.membresia.count({
      where: {
        estado: 'ACTIVA',
        fechaFin: {
            gte: today,
            lte: next5Days
        },
        cliente: sucursalId ? { sucursalBaseId: sucursalId } : undefined
      }
    });

    return {
      ingresosHoy: ingresosHoy._sum.montoTotal || 0,
      ingresosMes: ingresosMes._sum.montoTotal || 0,
      clientesTotales,
      clientesActivos,
      asistenciasHoy,
      membresiasPorVencer
    };
  }

  async getRevenueChart(sucursalId?: string) {
    const filterTransaccion = sucursalId ? { sucursalId } : {};
    const desde = startOfDay(subDays(new Date(), 6));

    // Una sola consulta trae los ingresos de los últimos 7 días; el
    // agrupamiento por día se hace en memoria en vez de 7 aggregate()
    // separados (uno por día).
    const transacciones = await this.prisma.extendedClient.transaccion.findMany({
      where: { ...filterTransaccion, tipo: 'INGRESO', createdAt: { gte: desde } },
      select: { createdAt: true, montoTotal: true },
    });

    const totalesPorDia = new Map<string, number>();
    for (const t of transacciones) {
      const key = format(startOfDay(t.createdAt), 'yyyy-MM-dd');
      totalesPorDia.set(key, (totalesPorDia.get(key) || 0) + Number(t.montoTotal));
    }

    const chartData = [];
    for (let i = 6; i >= 0; i--) {
        const dateStart = startOfDay(subDays(new Date(), i));
        const key = format(dateStart, 'yyyy-MM-dd');

        chartData.push({
            name: format(dateStart, 'dd MMM'),
            Ingresos: totalesPorDia.get(key) || 0
        });
    }

    return chartData;
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
