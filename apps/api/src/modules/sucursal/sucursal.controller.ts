import { Controller, Get, Post, Body, Put, Param, Delete, UseGuards } from '@nestjs/common';
import { SucursalService } from './sucursal.service';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { UpdateSucursalDto } from './dto/update-sucursal.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sucursales')
export class SucursalController {
  constructor(private readonly sucursalService: SucursalService) {}

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'sucursales' })
  create(@Body() createSucursalDto: CreateSucursalDto) {
    return this.sucursalService.create(createSucursalDto);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'sucursales' })
  findAll() {
    return this.sucursalService.findAll();
  }

  @Get(':id')
  @RequirePermissions({ accion: 'leer', modulo: 'sucursales' })
  findOne(@Param('id') id: string) {
    return this.sucursalService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'sucursales' })
  update(@Param('id') id: string, @Body() updateSucursalDto: UpdateSucursalDto) {
    return this.sucursalService.update(id, updateSucursalDto);
  }

  @Delete(':id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'sucursales' })
  remove(@Param('id') id: string) {
    return this.sucursalService.remove(id);
  }

  @Post(':id/restore')
  @RequirePermissions({ accion: 'eliminar', modulo: 'sucursales' })
  restore(@Param('id') id: string) {
    return this.sucursalService.restore(id);
  }
}
