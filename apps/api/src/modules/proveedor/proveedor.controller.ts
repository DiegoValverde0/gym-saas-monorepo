import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ProveedorService } from './proveedor.service';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { UpdateProveedorDto } from './dto/update-proveedor.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// Reusa el módulo de permisos 'transacciones' (mismo catálogo RBAC ya
// sembrado, sin tocar seed.ts -- ver nota en gasto-plantilla.controller.ts):
// quien gestiona transacciones/gastos gestiona el catálogo de proveedores.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('proveedores')
export class ProveedorController {
  constructor(private readonly proveedorService: ProveedorService) {}

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'transacciones' })
  create(@Body() dto: CreateProveedorDto) {
    return this.proveedorService.create(dto);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'transacciones' })
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.proveedorService.findAll(pagination);
  }

  @Get(':id')
  @RequirePermissions({ accion: 'leer', modulo: 'transacciones' })
  findOne(@Param('id') id: string) {
    return this.proveedorService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'transacciones' })
  update(@Param('id') id: string, @Body() dto: UpdateProveedorDto) {
    return this.proveedorService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'transacciones' })
  remove(@Param('id') id: string) {
    return this.proveedorService.remove(id);
  }

  @Post(':id/restore')
  @RequirePermissions({ accion: 'eliminar', modulo: 'transacciones' })
  restore(@Param('id') id: string) {
    return this.proveedorService.restore(id);
  }
}
