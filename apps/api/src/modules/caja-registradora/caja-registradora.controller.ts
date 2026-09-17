import { Controller, Get, Post, Body, Put, Param, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { CajaRegistradoraService } from './caja-registradora.service';
import { CreateCajaRegistradoraDto } from './dto/create-caja-registradora.dto';
import { UpdateCajaRegistradoraDto } from './dto/update-caja-registradora.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// Nota: NO se gatea con @RequiereModulo('puntoVenta') aunque el sidebar oculte
// "Cajas" bajo ese toggle -- el checkout de membresías (POSModal) depende de
// /apertura-caja/me para saber si hay una caja abierta, independientemente de
// si el gimnasio vende "artículos sueltos" o no. Ver mismo comentario en
// apertura-caja.controller.ts y transaccion.controller.ts.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cajas-registradoras')
export class CajaRegistradoraController {
  constructor(private readonly cajaRegistradoraService: CajaRegistradoraService) {}

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'cajas_registradoras' })
  create(@Body() createCajaRegistradoraDto: CreateCajaRegistradoraDto, @Request() req) {
    // req.user viene del JwtAuthGuard
    return this.cajaRegistradoraService.create(createCajaRegistradoraDto, req.user.sub);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'cajas_registradoras' })
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.cajaRegistradoraService.findAll(pagination);
  }

  @Get(':id')
  @RequirePermissions({ accion: 'leer', modulo: 'cajas_registradoras' })
  findOne(@Param('id') id: string) {
    return this.cajaRegistradoraService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'cajas_registradoras' })
  update(@Param('id') id: string, @Body() updateCajaRegistradoraDto: UpdateCajaRegistradoraDto) {
    return this.cajaRegistradoraService.update(id, updateCajaRegistradoraDto);
  }

  @Delete(':id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'cajas_registradoras' })
  remove(@Param('id') id: string) {
    return this.cajaRegistradoraService.remove(id);
  }

  @Post(':id/restore')
  @RequirePermissions({ accion: 'eliminar', modulo: 'cajas_registradoras' })
  restore(@Param('id') id: string) {
    return this.cajaRegistradoraService.restore(id);
  }
}
