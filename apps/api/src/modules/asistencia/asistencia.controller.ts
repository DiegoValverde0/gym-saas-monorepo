import { Controller, Get, Post, Put, Body, Patch, Param, ParseUUIDPipe, UseGuards, Req } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { AsistenciaService } from './asistencia.service';
import { CreateAsistenciaDto, ValidateAsistenciaDto } from './dto/create-asistencia.dto';
import { DefinirPinKioscoDto, IngresoKioscoDto, PinKioscoDto } from './dto/kiosco.dto';
import { KioscoService } from './kiosco.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModuloActivoGuard } from '../../common/guards/modulo-activo.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequiereModulo } from '../../common/decorators/requiere-modulo.decorator';

interface RequestWithUser extends ExpressRequest {
  user: {
    sub: string;
    organizacionId?: string;
    is_superadmin?: boolean;
  };
}

@UseGuards(JwtAuthGuard, RolesGuard, ModuloActivoGuard)
// Módulo propio: el control de acceso de clientes no depende de la gestión
// de personal (turnos, equipo).
@RequiereModulo('controlAcceso')
@Controller('asistencias')
export class AsistenciaController {
  constructor(
    private readonly asistenciaService: AsistenciaService,
    private readonly kioscoService: KioscoService,
  ) {}

  // Modo kiosco (plan 10.3): el cliente escribe su documento en la tablet.
  @Post('kiosco/ingreso')
  @RequirePermissions({ accion: 'crear', modulo: 'asistencias' })
  ingresoKiosco(@Body() dto: IngresoKioscoDto, @Req() req: RequestWithUser) {
    return this.kioscoService.ingresar(dto.documento, dto.sucursalId, req.user);
  }

  @Post('kiosco/salir')
  @RequirePermissions({ accion: 'crear', modulo: 'asistencias' })
  salirKiosco(@Body() dto: PinKioscoDto, @Req() req: RequestWithUser) {
    return this.kioscoService.salir(dto.pin, req.user);
  }

  // Mismo permiso que guardar la configuración de la organización.
  @Put('kiosco/pin')
  @RequirePermissions({ accion: 'actualizar', modulo: 'organizaciones' })
  definirPinKiosco(@Body() dto: DefinirPinKioscoDto) {
    return this.kioscoService.definirPin(dto.pin);
  }

  @Post('validate')
  @RequirePermissions({ accion: 'crear', modulo: 'asistencias' })
  validateAccess(@Body() dto: ValidateAsistenciaDto, @Req() req: RequestWithUser) {
    return this.asistenciaService.validateAccess(dto.clienteId, req.user, dto.sucursalId);
  }

  @Post('checkin')
  @RequirePermissions({ accion: 'crear', modulo: 'asistencias' })
  checkIn(@Body() createAsistenciaDto: CreateAsistenciaDto, @Req() req: RequestWithUser) {
    return this.asistenciaService.checkIn(createAsistenciaDto, req.user);
  }

  @Patch('checkout/:id')
  @RequirePermissions({ accion: 'crear', modulo: 'asistencias' })
  checkOut(@Param('id') id: string) {
    return this.asistenciaService.checkOut(id);
  }

  @Get('activas/:sucursalId')
  @RequirePermissions({ accion: 'leer', modulo: 'asistencias' })
  findActivas(@Param('sucursalId', ParseUUIDPipe) sucursalId: string, @Req() req: RequestWithUser) {
    return this.asistenciaService.findActivas(sucursalId, req.user.organizacionId);
  }

  @Get('historial/:sucursalId')
  @RequirePermissions({ accion: 'leer', modulo: 'asistencias' })
  findHistorial(@Param('sucursalId', ParseUUIDPipe) sucursalId: string, @Req() req: RequestWithUser) {
    return this.asistenciaService.findHistorialHoy(sucursalId, req.user.organizacionId);
  }
}
