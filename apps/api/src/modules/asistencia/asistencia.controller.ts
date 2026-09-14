import { Controller, Get, Post, Body, Patch, Param, UseGuards, Req } from '@nestjs/common';
import { AsistenciaService } from './asistencia.service';
import { CreateAsistenciaDto, ValidateAsistenciaDto } from './dto/create-asistencia.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('asistencias')
export class AsistenciaController {
  constructor(private readonly asistenciaService: AsistenciaService) {}

  @Post('validate')
  @RequirePermissions({ accion: 'crear', modulo: 'asistencias' })
  validateAccess(@Body() dto: ValidateAsistenciaDto, @Req() req: any) {
    return this.asistenciaService.validateAccess(dto.clienteId, req.user);
  }

  @Post('checkin')
  @RequirePermissions({ accion: 'crear', modulo: 'asistencias' })
  checkIn(@Body() createAsistenciaDto: CreateAsistenciaDto, @Req() req: any) {
    return this.asistenciaService.checkIn(createAsistenciaDto, req.user);
  }

  @Patch('checkout/:id')
  @RequirePermissions({ accion: 'crear', modulo: 'asistencias' })
  checkOut(@Param('id') id: string) {
    return this.asistenciaService.checkOut(id);
  }

  @Get('activas/:sucursalId')
  @RequirePermissions({ accion: 'leer', modulo: 'asistencias' })
  findActivas(@Param('sucursalId') sucursalId: string) {
    return this.asistenciaService.findActivas(sucursalId);
  }

  @Get('historial/:sucursalId')
  @RequirePermissions({ accion: 'leer', modulo: 'asistencias' })
  findHistorial(@Param('sucursalId') sucursalId: string) {
    return this.asistenciaService.findHistorialHoy(sucursalId);
  }
}
