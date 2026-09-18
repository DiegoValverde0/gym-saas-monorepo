import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ClaseProgramadaService } from './clase-programada.service';
import { CreateClaseProgramadaDto } from './dto/create-clase-programada.dto';
import { UpdateClaseProgramadaDto } from './dto/update-clase-programada.dto';
import { VerificarDisponibilidadDto } from './dto/verificar-disponibilidad.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModuloActivoGuard } from '../../common/guards/modulo-activo.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequiereModulo } from '../../common/decorators/requiere-modulo.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard, ModuloActivoGuard)
@RequiereModulo('clasesGrupales')
@Controller('clases')
export class ClaseProgramadaController {
  constructor(private readonly claseProgramadaService: ClaseProgramadaService) {}

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'clases' })
  create(@Body() createClaseProgramadaDto: CreateClaseProgramadaDto) {
    return this.claseProgramadaService.create(createClaseProgramadaDto);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'clases' })
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.claseProgramadaService.findAll(pagination);
  }

  // Declarado antes de ':id' a propósito: si fuera después, Nest lo
  // interpretaría como Get(':id') con id="disponibilidad".
  @Get('disponibilidad')
  @RequirePermissions({ accion: 'leer', modulo: 'clases' })
  verificarDisponibilidad(@Query() query: VerificarDisponibilidadDto) {
    return this.claseProgramadaService.verificarDisponibilidad(query);
  }

  @Get(':id')
  @RequirePermissions({ accion: 'leer', modulo: 'clases' })
  findOne(@Param('id') id: string) {
    return this.claseProgramadaService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'clases' })
  update(@Param('id') id: string, @Body() updateClaseProgramadaDto: UpdateClaseProgramadaDto) {
    return this.claseProgramadaService.update(id, updateClaseProgramadaDto);
  }

  @Delete(':id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'clases' })
  remove(@Param('id') id: string) {
    return this.claseProgramadaService.remove(id);
  }

  @Post(':id/restore')
  @RequirePermissions({ accion: 'eliminar', modulo: 'clases' })
  restore(@Param('id') id: string) {
    return this.claseProgramadaService.restore(id);
  }
}
