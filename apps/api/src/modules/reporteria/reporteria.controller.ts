import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ReporteriaService } from './reporteria.service';
import { EjecutarReporteDto } from './dto/ejecutar-reporte.dto';
import { ReportesGuardadosService } from './reportes-guardados.service';
import {
  ActualizarCarpetaDto,
  ActualizarReporteDto,
  CrearCarpetaDto,
  DuplicarReporteDto,
  EjecutarGuardadoDto,
  GuardarReporteDto,
  ListarReportesDto,
} from './dto/reportes-guardados.dto';

// Reportería (docs/plan-reporteria.md). Separada del tablero de /reportes.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reporteria')
export class ReporteriaController {
  constructor(
    private readonly reporteriaService: ReporteriaService,
    private readonly guardados: ReportesGuardadosService,
  ) {}

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

  // ---- Reportes guardados (fase 3). Quién ve y cambia qué: ver
  // ReportesGuardadosService.

  @Get('reportes')
  @RequirePermissions({ accion: 'leer', modulo: 'reportes' })
  listar(@Query() q: ListarReportesDto) {
    return this.guardados.listar(q);
  }

  @Get('reportes/:id')
  @RequirePermissions({ accion: 'leer', modulo: 'reportes' })
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.guardados.obtener(id);
  }

  // Correr un reporte guardado: alcanza con verlo (recepción).
  @Post('reportes/:id/ejecutar')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions({ accion: 'leer', modulo: 'reportes' })
  ejecutarGuardado(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EjecutarGuardadoDto) {
    return this.guardados.ejecutar(id, dto);
  }

  // Exportar a CSV o Excel (fase 5): con ver el reporte alcanza (recepción exporta).
  @Post('reportes/:id/exportar')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions({ accion: 'leer', modulo: 'reportes' })
  async exportar(@Param('id', ParseUUIDPipe) id: string, @Query('formato') formato: string, @Body() dto: EjecutarGuardadoDto) {
    if (formato !== 'csv' && formato !== 'xlsx') throw new BadRequestException('Elige CSV o Excel.');
    const { contenido, nombre, tipoMime } = await this.guardados.exportar(id, formato, dto);
    return new StreamableFile(contenido, {
      type: tipoMime,
      length: contenido.length,
      // El nombre en ASCII y, aparte, el original con acentos (RFC 5987).
      disposition: `attachment; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
    });
  }

  @Post('reportes')
  @RequirePermissions({ accion: 'crear', modulo: 'reportes' })
  crear(@Body() dto: GuardarReporteDto) {
    return this.guardados.crear(dto);
  }

  @Put('reportes/:id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'reportes' })
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarReporteDto) {
    return this.guardados.actualizar(id, dto);
  }

  @Post('reportes/:id/duplicar')
  @RequirePermissions({ accion: 'crear', modulo: 'reportes' })
  duplicar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DuplicarReporteDto) {
    return this.guardados.duplicar(id, dto);
  }

  @Delete('reportes/:id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'reportes' })
  eliminar(@Param('id', ParseUUIDPipe) id: string) {
    return this.guardados.eliminar(id);
  }

  @Post('reportes/:id/restaurar')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions({ accion: 'eliminar', modulo: 'reportes' })
  restaurar(@Param('id', ParseUUIDPipe) id: string) {
    return this.guardados.restaurar(id);
  }

  // ---- Carpetas

  @Get('carpetas')
  @RequirePermissions({ accion: 'leer', modulo: 'reportes' })
  carpetas() {
    return this.guardados.carpetas();
  }

  @Post('carpetas')
  @RequirePermissions({ accion: 'crear', modulo: 'reportes' })
  crearCarpeta(@Body() dto: CrearCarpetaDto) {
    return this.guardados.crearCarpeta(dto);
  }

  @Put('carpetas/:id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'reportes' })
  actualizarCarpeta(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarCarpetaDto) {
    return this.guardados.actualizarCarpeta(id, dto);
  }

  @Delete('carpetas/:id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'reportes' })
  eliminarCarpeta(@Param('id', ParseUUIDPipe) id: string) {
    return this.guardados.eliminarCarpeta(id);
  }
}
