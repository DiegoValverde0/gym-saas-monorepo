import { Controller, Get, Post, Body, Put, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { CajaRegistradoraService } from './caja-registradora.service';
import { CreateCajaRegistradoraDto } from './dto/create-caja-registradora.dto';
import { UpdateCajaRegistradoraDto } from './dto/update-caja-registradora.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

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
  findAll() {
    return this.cajaRegistradoraService.findAll();
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
}
