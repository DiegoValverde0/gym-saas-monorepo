import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

interface RequestWithUser extends ExpressRequest {
  user: {
    sucursalId?: string;
  };
  /** Los deja RolesGuard. */
  permisos?: string[];
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpis')
  @RequirePermissions({ accion: 'leer', modulo: 'dashboard' })
  async getKpis(@Req() req: RequestWithUser) {
    const sucursalId = req.user.sucursalId;
    // Los ingresos solo para quien puede ver los movimientos (el instructor no).
    return this.dashboardService.getKpis(sucursalId, { verIngresos: !!req.permisos?.includes('transacciones:leer') });
  }

  @Get('charts')
  @RequirePermissions({ accion: 'leer', modulo: 'dashboard' })
  async getCharts(@Req() req: RequestWithUser) {
    const sucursalId = req.user.sucursalId;
    return this.dashboardService.getRevenueChart(sucursalId);
  }

  @Get('recent-activity')
  @RequirePermissions({ accion: 'leer', modulo: 'dashboard' })
  async getRecentActivity(@Req() req: RequestWithUser) {
    const sucursalId = req.user.sucursalId;
    return this.dashboardService.getRecentActivity(sucursalId);
  }

  // Membresías que vencen en los próximos 7 días y todavía no se renovaron
  // (Dashboard del modo simple, plan 11.13, con botón para avisar por WhatsApp).
  @Get('por-vencer')
  @RequirePermissions({ accion: 'leer', modulo: 'dashboard' })
  async getPorVencer(@Req() req: RequestWithUser) {
    return this.dashboardService.getPorVencer(req.user.sucursalId);
  }

  @Get('segmentacion-clientes')
  @RequirePermissions({ accion: 'leer', modulo: 'dashboard' })
  async getSegmentacionClientes(@Req() req: RequestWithUser) {
    const sucursalId = req.user.sucursalId;
    return this.dashboardService.getSegmentacionClientes(sucursalId);
  }
}
