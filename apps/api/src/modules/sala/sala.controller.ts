import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SalaService } from './sala.service';
import { CreateSalaDto, SalasQueryDto, UpdateSalaDto } from './dto/sala.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

// Las salas son parte de la sucursal: se leen con el permiso de leer clases
// (el asistente las necesita) y se gestionan con el de editar sucursales,
// sin sembrar permisos nuevos.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('salas')
export class SalaController {
  constructor(private readonly salaService: SalaService) {}

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'clases' })
  findAll(@Query() q: SalasQueryDto) {
    return this.salaService.findAll(q);
  }

  @Post()
  @RequirePermissions({ accion: 'actualizar', modulo: 'sucursales' })
  create(@Body() dto: CreateSalaDto) {
    return this.salaService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'sucursales' })
  update(@Param('id') id: string, @Body() dto: UpdateSalaDto) {
    return this.salaService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'sucursales' })
  remove(@Param('id') id: string) {
    return this.salaService.remove(id);
  }
}
