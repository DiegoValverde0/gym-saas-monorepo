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
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpis')
  @RequirePermissions({ accion: 'leer', modulo: 'dashboard' })
  async getKpis(@Req() req: RequestWithUser) {
    const sucursalId = req.user.sucursalId;
    return this.dashboardService.getKpis(sucursalId);
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
}
