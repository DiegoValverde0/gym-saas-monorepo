import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { RangoReporteDto } from './dto/rango-reporte.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

// Cada reporte pide el permiso de lectura de lo que muestra, igual que las
// pantallas de origen (transacciones, clases, asistencias, turnos).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get('resumen')
  @RequirePermissions({ accion: 'leer', modulo: 'transacciones' })
  resumen(@Query() q: RangoReporteDto) {
    return this.reportesService.resumen(q.sucursalId);
  }

  @Get('planes')
  @RequirePermissions({ accion: 'leer', modulo: 'transacciones' })
  planes(@Query() q: RangoReporteDto) {
    return this.reportesService.planes(q);
  }

  @Get('clases')
  @RequirePermissions({ accion: 'leer', modulo: 'clases' })
  clases(@Query() q: RangoReporteDto) {
    return this.reportesService.clases(q);
  }

  @Get('asistencia')
  @RequirePermissions({ accion: 'leer', modulo: 'asistencias' })
  asistencia(@Query() q: RangoReporteDto) {
    return this.reportesService.asistencia(q);
  }

  @Get('financiero')
  @RequirePermissions({ accion: 'leer', modulo: 'transacciones' })
  financiero(@Query() q: RangoReporteDto) {
    return this.reportesService.financiero(q);
  }

  @Get('equipo')
  @RequirePermissions({ accion: 'leer', modulo: 'turnos' })
  equipo(@Query() q: RangoReporteDto) {
    return this.reportesService.equipo(q);
  }
}
