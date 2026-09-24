import { Controller, Get, Post, Body, Patch, Param, ParseUUIDPipe, Delete, Query, UseGuards } from '@nestjs/common';
import { PersonalService } from './personal.service';
import { CreatePersonalDto } from './dto/create-personal.dto';
import { UpdatePersonalDto } from './dto/update-personal.dto';
import { CreateMiembroEquipoDto, UpdateMiembroEquipoDto } from './dto/miembro-equipo.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

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
