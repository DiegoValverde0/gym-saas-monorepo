import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { GastoPlantillaService } from './gasto-plantilla.service';
import { CreateGastoPlantillaDto } from './dto/create-gasto-plantilla.dto';
import { UpdateGastoPlantillaDto } from './dto/update-gasto-plantilla.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequiereModulo } from '../../common/decorators/requiere-modulo.decorator';
import { ModuloActivoGuard } from '../../common/guards/modulo-activo.guard';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// Reusa el módulo de permisos 'transacciones' (mismo catálogo RBAC ya
// sembrado, sin tocar seed.ts -- volver a sembrar trunca TODA la base de
// datos, ver seed.ts línea 17): quien gestiona transacciones/gastos
// gestiona también sus plantillas recurrentes.
@UseGuards(JwtAuthGuard, RolesGuard, ModuloActivoGuard)
@RequiereModulo('controlGastos')
@Controller('gastos-plantilla')
export class GastoPlantillaController {
  constructor(private readonly gastoPlantillaService: GastoPlantillaService) {}

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'transacciones' })
  create(@Body() dto: CreateGastoPlantillaDto) {
    return this.gastoPlantillaService.create(dto);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'transacciones' })
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.gastoPlantillaService.findAll(pagination);
  }

  @Get(':id')
  @RequirePermissions({ accion: 'leer', modulo: 'transacciones' })
  findOne(@Param('id') id: string) {
    return this.gastoPlantillaService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'transacciones' })
  update(@Param('id') id: string, @Body() dto: UpdateGastoPlantillaDto) {
    return this.gastoPlantillaService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'transacciones' })
  remove(@Param('id') id: string) {
    return this.gastoPlantillaService.remove(id);
  }

  @Post(':id/restore')
  @RequirePermissions({ accion: 'eliminar', modulo: 'transacciones' })
  restore(@Param('id') id: string) {
    return this.gastoPlantillaService.restore(id);
  }

  // Dispara la proyección para la organización del usuario actual, en vez de
  // esperar al cron nocturno -- útil justo después de crear una plantilla.
  @Post('generar')
  @RequirePermissions({ accion: 'crear', modulo: 'transacciones' })
  generar() {
    return this.gastoPlantillaService.generarAhora();
  }
}
