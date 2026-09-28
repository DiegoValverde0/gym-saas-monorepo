import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ReporteriaService } from './reporteria.service';
import { EjecutarReporteDto } from './dto/ejecutar-reporte.dto';

// Reportería (docs/plan-reporteria.md). Separada del tablero de /reportes.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reporteria')
export class ReporteriaController {
  constructor(private readonly reporteriaService: ReporteriaService) {}

  @Get('tipos')
  @RequirePermissions({ accion: 'leer', modulo: 'reportes' })
  tipos() {
    return this.reporteriaService.tipos();
  }

  // Vista previa del constructor: la primera página de 50 filas.
  @Post('vista-previa')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions({ accion: 'crear', modulo: 'reportes' })
  vistaPrevia(@Body() dto: EjecutarReporteDto) {
    return this.reporteriaService.ejecutarDefinicion(dto.definicion, 1, 50);
  }

  @Post('ejecutar')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions({ accion: 'crear', modulo: 'reportes' })
  ejecutar(@Body() dto: EjecutarReporteDto) {
    return this.reporteriaService.ejecutarDefinicion(dto.definicion, dto.pagina, dto.porPagina);
  }
}
