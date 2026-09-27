import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ReservaClaseService } from './reserva-clase.service';
import { CreateReservaClaseDto } from './dto/create-reserva-clase.dto';
import { UpdateReservaClaseDto } from './dto/update-reserva-clase.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModuloActivoGuard } from '../../common/guards/modulo-activo.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequiereModulo } from '../../common/decorators/requiere-modulo.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard, ModuloActivoGuard)
@RequiereModulo('clasesGrupales')
@Controller('reservas')
export class ReservaClaseController {
  constructor(private readonly reservaClaseService: ReservaClaseService) {}

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'reservas' })
  create(@Body() createReservaClaseDto: CreateReservaClaseDto) {
    return this.reservaClaseService.create(createReservaClaseDto);
  }

  // Reservar aunque el plan no incluya la clase (recepción): exige además el
  // mismo permiso que forzar un ingreso en Control de acceso.
  @Post('forzar')
  @RequirePermissions({ accion: 'crear', modulo: 'reservas' }, { accion: 'forzar', modulo: 'asistencias' })
  forzar(@Body() createReservaClaseDto: CreateReservaClaseDto) {
    return this.reservaClaseService.create(createReservaClaseDto, true);
  }

  // Semáforo: ¿puede reservar este cliente esta clase? y, si no, por qué.
  @Get('puede-reservar')
  @RequirePermissions({ accion: 'crear', modulo: 'reservas' })
  puedeReservar(@Query('claseId', ParseUUIDPipe) claseId: string, @Query('clienteId', ParseUUIDPipe) clienteId: string) {
    return this.reservaClaseService.puedeReservar(claseId, clienteId);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'reservas' })
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.reservaClaseService.findAll(pagination);
  }

  @Get(':id')
  @RequirePermissions({ accion: 'leer', modulo: 'reservas' })
  findOne(@Param('id') id: string) {
    return this.reservaClaseService.findOne(id);
  }

  // Marcar asistencia (ASISTIO/NO_ASISTIO) tras la clase.
  @Patch(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'reservas' })
  update(@Param('id') id: string, @Body() updateReservaClaseDto: UpdateReservaClaseDto) {
    return this.reservaClaseService.update(id, updateReservaClaseDto);
  }

  // Endpoint separado (no el PATCH genérico de arriba) porque usa el permiso
  // reservas:eliminar, que es el que ya tiene sembrado el rol CLIENTE para
  // poder cancelar su propia reserva -- nunca un borrado físico.
  @Patch(':id/cancelar')
  @RequirePermissions({ accion: 'eliminar', modulo: 'reservas' })
  cancelar(@Param('id') id: string) {
    return this.reservaClaseService.cancelar(id);
  }
}
