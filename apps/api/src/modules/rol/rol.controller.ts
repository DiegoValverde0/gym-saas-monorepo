import { Controller, Get, Post, Body, Put, Param, Delete, UseGuards } from '@nestjs/common';
import { RolService } from './rol.service';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('roles')
export class RolController {
  constructor(private readonly rolService: RolService) {}

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'roles' })
  create(@Body() createRolDto: CreateRolDto) {
    return this.rolService.create(createRolDto);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'roles' })
  findAll() {
    return this.rolService.findAll();
  }

  @Get(':id')
  @RequirePermissions({ accion: 'leer', modulo: 'roles' })
  findOne(@Param('id') id: string) {
    return this.rolService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'roles' })
  update(@Param('id') id: string, @Body() updateRolDto: UpdateRolDto) {
    return this.rolService.update(id, updateRolDto);
  }

  @Delete(':id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'roles' })
  remove(@Param('id') id: string) {
    return this.rolService.remove(id);
  }

  @Post(':id/restore')
  @RequirePermissions({ accion: 'eliminar', modulo: 'roles' })
  restore(@Param('id') id: string) {
    return this.rolService.restore(id);
  }
}
