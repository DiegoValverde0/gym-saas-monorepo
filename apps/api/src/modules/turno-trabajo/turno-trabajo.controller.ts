import { Controller, Get, Post, Body, Patch, Param, Delete, Query, Req, UseGuards } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { TurnoTrabajoService } from './turno-trabajo.service';
import { CreateTurnoTrabajoDto } from './dto/create-turno-trabajo.dto';
import { UpdateTurnoTrabajoDto } from './dto/update-turno-trabajo.dto';
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
