import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { CuentaBancariaService } from './cuenta-bancaria.service';
import { CreateCuentaBancariaDto } from './dto/create-cuenta-bancaria.dto';
import { UpdateCuentaBancariaDto } from './dto/update-cuenta-bancaria.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cuentas-bancarias')
export class CuentaBancariaController {
  constructor(private readonly cuentaBancariaService: CuentaBancariaService) {}

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'cuentas_bancarias' })
  create(@Body() createCuentaBancariaDto: CreateCuentaBancariaDto) {
    return this.cuentaBancariaService.create(createCuentaBancariaDto);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'cuentas_bancarias' })
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.cuentaBancariaService.findAll(pagination);
  }

  @Get(':id')
  @RequirePermissions({ accion: 'leer', modulo: 'cuentas_bancarias' })
  findOne(@Param('id') id: string) {
    return this.cuentaBancariaService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'cuentas_bancarias' })
  update(@Param('id') id: string, @Body() updateCuentaBancariaDto: UpdateCuentaBancariaDto) {
    return this.cuentaBancariaService.update(id, updateCuentaBancariaDto);
  }

  @Delete(':id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'cuentas_bancarias' })
  remove(@Param('id') id: string) {
    return this.cuentaBancariaService.remove(id);
  }
}
