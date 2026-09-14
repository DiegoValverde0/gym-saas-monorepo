import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@repo/database';
import { startOfDay, startOfMonth, subDays, format } from 'date-fns';

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
    const chartData = [];

    // Últimos 7 días
    for (let i = 6; i >= 0; i--) {
        const dateStart = startOfDay(subDays(new Date(), i));
        const dateEnd = new Date(dateStart);
        dateEnd.setDate(dateEnd.getDate() + 1);

        const agg = await this.prisma.extendedClient.transaccion.aggregate({
            where: { 
                ...filterTransaccion, 
                tipo: 'INGRESO', 
                createdAt: { gte: dateStart, lt: dateEnd } 
            },
            _sum: { montoTotal: true }
        });

        chartData.push({
            name: format(dateStart, 'dd MMM'),
            Ingresos: Number(agg._sum.montoTotal || 0)
        });
    }

    return chartData;
  }

  async getRecentActivity(sucursalId?: string) {
    const filterCliente = sucursalId ? { sucursalBaseId: sucursalId } : {};
    
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
