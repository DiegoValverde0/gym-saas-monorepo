import { Controller, Get, Post, Body, Patch, Param, Delete, Query, Req, UseGuards } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { TurnoTrabajoService } from './turno-trabajo.service';
import { CreateTurnoTrabajoDto } from './dto/create-turno-trabajo.dto';
import { UpdateTurnoTrabajoDto } from './dto/update-turno-trabajo.dto';
import { AusenciaDto, JornadasHoyQueryDto, QuitarAusenciaDto, RangoAusenciasQueryDto } from './dto/ausencia.dto';
import { PinDto } from '../personal/dto/pin.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModuloActivoGuard } from '../../common/guards/modulo-activo.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequiereModulo } from '../../common/decorators/requiere-modulo.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

interface RequestWithUser extends ExpressRequest {
  user: { sub: string };
}

@UseGuards(JwtAuthGuard, RolesGuard, ModuloActivoGuard)
@RequiereModulo('controlPersonal')
@Controller('turnos')
export class TurnoTrabajoController {
  constructor(private readonly turnoTrabajoService: TurnoTrabajoService) {}

  // Autoservicio ("reloj checador" del propio staff) -- declarado antes de
  // las rutas ':id' a propósito, y sin @RequirePermissions: ver el comentario
  // en turno-trabajo.service.ts sobre por qué esto no depende del permiso
  // de gestión de turnos.
  // Tablet de recepción (fase 6, DB-4): la persona teclea su PIN. Lo usa la
  // sesión abierta en la tablet, con el permiso de registrar ingresos.
  @Post('marcar-con-pin')
  @RequirePermissions({ accion: 'crear', modulo: 'asistencias' })
  marcarConPin(@Body() dto: PinDto, @Req() req: RequestWithUser) {
    return this.turnoTrabajoService.marcarConPin(dto.pin, req.user.sub);
  }

  @Get('mi-turno/hoy')
  miTurnoDeHoy(@Req() req: RequestWithUser) {
    return this.turnoTrabajoService.miTurnoDeHoy(req.user.sub);
  }

  @Post('mi-turno/marcar-ingreso')
  marcarIngreso(@Req() req: RequestWithUser) {
    return this.turnoTrabajoService.marcarIngreso(req.user.sub);
  }

  @Post('mi-turno/marcar-salida')
  marcarSalida(@Req() req: RequestWithUser) {
    return this.turnoTrabajoService.marcarSalida(req.user.sub);
  }

  // Jornadas del equipo (plan 7.2). También antes de ':id'.
  @Get('hoy')
  @RequirePermissions({ accion: 'leer', modulo: 'turnos' })
  hoy(@Query() query: JornadasHoyQueryDto) {
    return this.turnoTrabajoService.hoy(query);
  }

  @Get('ausencias')
  @RequirePermissions({ accion: 'leer', modulo: 'turnos' })
  listarAusencias(@Query() query: RangoAusenciasQueryDto) {
    return this.turnoTrabajoService.listarAusencias(query);
  }

  // Muestra el impacto (días y clases afectadas) antes de confirmar.
  @Post('ausencias/vista-previa')
  @RequirePermissions({ accion: 'leer', modulo: 'turnos' })
  vistaPreviaAusencia(@Body() dto: AusenciaDto) {
    return this.turnoTrabajoService.vistaPreviaAusencia(dto);
  }

  @Post('ausencias')
  @RequirePermissions({ accion: 'actualizar', modulo: 'turnos' })
  registrarAusencia(@Body() dto: AusenciaDto) {
    return this.turnoTrabajoService.registrarAusencia(dto);
  }

  @Post('ausencias/quitar')
  @RequirePermissions({ accion: 'actualizar', modulo: 'turnos' })
  quitarAusencia(@Body() dto: QuitarAusenciaDto) {
    return this.turnoTrabajoService.quitarAusencia(dto);
  }

  // Marcaje por otra persona (quien gestiona el equipo), solo jornadas de hoy.
  @Post(':id/marcar-ingreso')
  @RequirePermissions({ accion: 'actualizar', modulo: 'turnos' })
  marcarIngresoDe(@Param('id') id: string) {
    return this.turnoTrabajoService.marcarIngresoDe(id);
  }

  @Post(':id/marcar-salida')
  @RequirePermissions({ accion: 'actualizar', modulo: 'turnos' })
  marcarSalidaDe(@Param('id') id: string) {
    return this.turnoTrabajoService.marcarSalidaDe(id);
  }

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'turnos' })
  create(@Body() createTurnoTrabajoDto: CreateTurnoTrabajoDto) {
    return this.turnoTrabajoService.create(createTurnoTrabajoDto);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'turnos' })
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.turnoTrabajoService.findAll(pagination);
  }

  @Get(':id')
  @RequirePermissions({ accion: 'leer', modulo: 'turnos' })
  findOne(@Param('id') id: string) {
    return this.turnoTrabajoService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'turnos' })
  update(@Param('id') id: string, @Body() updateTurnoTrabajoDto: UpdateTurnoTrabajoDto) {
    return this.turnoTrabajoService.update(id, updateTurnoTrabajoDto);
  }

  @Delete(':id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'turnos' })
  remove(@Param('id') id: string) {
    return this.turnoTrabajoService.remove(id);
  }

  @Post(':id/restore')
  @RequirePermissions({ accion: 'eliminar', modulo: 'turnos' })
  restore(@Param('id') id: string) {
    return this.turnoTrabajoService.restore(id);
  }
}
