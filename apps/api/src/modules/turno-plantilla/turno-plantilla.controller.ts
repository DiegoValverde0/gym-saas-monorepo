import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TurnoPlantillaService } from './turno-plantilla.service';
import { CreateTurnoPlantillaDto } from './dto/create-turno-plantilla.dto';
import { UpdateTurnoPlantillaDto } from './dto/update-turno-plantilla.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModuloActivoGuard } from '../../common/guards/modulo-activo.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequiereModulo } from '../../common/decorators/requiere-modulo.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

class GenerarTurnosQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(26)
  semanas?: number;
}

// Reusa el módulo de permisos 'turnos' (mismo catálogo RBAC ya sembrado):
// quien gestiona turnos individuales gestiona sus plantillas recurrentes.
@UseGuards(JwtAuthGuard, RolesGuard, ModuloActivoGuard)
@RequiereModulo('controlPersonal')
@Controller('turnos-plantilla')
export class TurnoPlantillaController {
  constructor(private readonly turnoPlantillaService: TurnoPlantillaService) {}

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'turnos' })
  create(@Body() dto: CreateTurnoPlantillaDto) {
    return this.turnoPlantillaService.create(dto);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'turnos' })
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.turnoPlantillaService.findAll(pagination);
  }

  @Get(':id')
  @RequirePermissions({ accion: 'leer', modulo: 'turnos' })
  findOne(@Param('id') id: string) {
    return this.turnoPlantillaService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'turnos' })
  update(@Param('id') id: string, @Body() dto: UpdateTurnoPlantillaDto) {
    return this.turnoPlantillaService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'turnos' })
  remove(@Param('id') id: string) {
    return this.turnoPlantillaService.remove(id);
  }

  @Post(':id/restore')
  @RequirePermissions({ accion: 'eliminar', modulo: 'turnos' })
  restore(@Param('id') id: string) {
    return this.turnoPlantillaService.restore(id);
  }

  // Dispara la proyección para la organización del usuario actual, en vez de
  // esperar al cron nocturno -- útil justo después de crear/editar una plantilla.
  @Post('generar')
  @RequirePermissions({ accion: 'crear', modulo: 'turnos' })
  generar(@Query() query: GenerarTurnosQueryDto) {
    return this.turnoPlantillaService.generarAhora(query.semanas);
  }
}
