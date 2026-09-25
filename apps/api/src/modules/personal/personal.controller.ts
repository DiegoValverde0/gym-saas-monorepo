import { Controller, Get, Post, Body, Patch, Param, ParseUUIDPipe, Delete, Query, UseGuards, Req } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { PersonalService } from './personal.service';
import { CreatePersonalDto } from './dto/create-personal.dto';
import { UpdatePersonalDto } from './dto/update-personal.dto';
import { CreateMiembroEquipoDto, UpdateMiembroEquipoDto } from './dto/miembro-equipo.dto';
import { PinDto } from './dto/pin.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

interface RequestWithUser extends ExpressRequest {
  user: { sub: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('personal')
export class PersonalController {
  constructor(private readonly personalService: PersonalService) {}

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'staff' })
  create(@Body() createPersonalDto: CreatePersonalDto) {
    return this.personalService.create(createPersonalDto);
  }

  // Alta en un solo paso: crea además la cuenta de acceso, por eso exige
  // también usuarios:crear.
  @Post('equipo')
  @RequirePermissions({ accion: 'crear', modulo: 'staff' }, { accion: 'crear', modulo: 'usuarios' })
  crearMiembro(@Body() dto: CreateMiembroEquipoDto) {
    return this.personalService.crearMiembro(dto);
  }

  @Patch(':id/equipo')
  @RequirePermissions({ accion: 'actualizar', modulo: 'staff' })
  actualizarMiembro(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMiembroEquipoDto) {
    return this.personalService.actualizarMiembro(id, dto);
  }

  // Acciones de soporte (plan 6.6 d): exigen poder editar al equipo.
  @Post(':id/cerrar-sesiones')
  @RequirePermissions({ accion: 'actualizar', modulo: 'staff' })
  cerrarSesiones(@Param('id', ParseUUIDPipe) id: string) {
    return this.personalService.cerrarSesionesDe(id);
  }

  @Post(':id/restablecer-contrasena')
  @RequirePermissions({ accion: 'actualizar', modulo: 'staff' }, { accion: 'actualizar', modulo: 'usuarios' })
  restablecerContrasena(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    return this.personalService.restablecerContrasena(id, req.user.sub);
  }

  // PIN de marcaje en la tablet (fase 6, DB-4).
  @Post(':id/pin')
  @RequirePermissions({ accion: 'actualizar', modulo: 'staff' })
  asignarPin(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PinDto) {
    return this.personalService.asignarPin(id, dto.pin);
  }

  @Delete(':id/pin')
  @RequirePermissions({ accion: 'actualizar', modulo: 'staff' })
  quitarPin(@Param('id', ParseUUIDPipe) id: string) {
    return this.personalService.quitarPin(id);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'staff' })
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.personalService.findAll(pagination);
  }

  @Get(':id')
  @RequirePermissions({ accion: 'leer', modulo: 'staff' })
  findOne(@Param('id') id: string) {
    return this.personalService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'staff' })
  update(@Param('id') id: string, @Body() updatePersonalDto: UpdatePersonalDto) {
    return this.personalService.update(id, updatePersonalDto);
  }

  @Delete(':id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'staff' })
  remove(@Param('id') id: string) {
    return this.personalService.remove(id);
  }

  @Post(':id/restore')
  @RequirePermissions({ accion: 'eliminar', modulo: 'staff' })
  restore(@Param('id') id: string) {
    return this.personalService.restore(id);
  }
}
