import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ClasePlantillaService } from './clase-plantilla.service';
import { CreateClasePlantillaDto } from './dto/create-clase-plantilla.dto';
import { UpdateClasePlantillaDto } from './dto/update-clase-plantilla.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModuloActivoGuard } from '../../common/guards/modulo-activo.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequiereModulo } from '../../common/decorators/requiere-modulo.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

class GenerarClasesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(26)
  semanas?: number;
}

// Reusa el módulo de permisos 'clases' (mismo catálogo RBAC ya sembrado):
// quien gestiona clases gestiona sus plantillas recurrentes.
@UseGuards(JwtAuthGuard, RolesGuard, ModuloActivoGuard)
@RequiereModulo('clasesGrupales')
@Controller('clases-plantilla')
export class ClasePlantillaController {
  constructor(private readonly clasePlantillaService: ClasePlantillaService) {}

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'clases' })
  create(@Body() dto: CreateClasePlantillaDto) {
    return this.clasePlantillaService.create(dto);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'clases' })
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.clasePlantillaService.findAll(pagination);
  }

  @Get(':id')
  @RequirePermissions({ accion: 'leer', modulo: 'clases' })
  findOne(@Param('id') id: string) {
    return this.clasePlantillaService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'clases' })
  update(@Param('id') id: string, @Body() dto: UpdateClasePlantillaDto) {
    return this.clasePlantillaService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'clases' })
  remove(@Param('id') id: string) {
    return this.clasePlantillaService.remove(id);
  }

  @Post(':id/restore')
  @RequirePermissions({ accion: 'eliminar', modulo: 'clases' })
  restore(@Param('id') id: string) {
    return this.clasePlantillaService.restore(id);
  }

  // Dispara la proyección para la organización del usuario actual, en vez de
  // esperar al cron nocturno -- útil justo después de crear/editar una plantilla.
  @Post('generar')
  @RequirePermissions({ accion: 'crear', modulo: 'clases' })
  generar(@Query() query: GenerarClasesQueryDto) {
    return this.clasePlantillaService.generarAhora(query.semanas);
  }
}
