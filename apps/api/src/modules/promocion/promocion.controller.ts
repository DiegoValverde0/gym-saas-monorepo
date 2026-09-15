import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { PromocionService } from './promocion.service';
import { CreatePromocionDto } from './dto/create-promocion.dto';
import { UpdatePromocionDto } from './dto/update-promocion.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('promociones')
export class PromocionController {
  constructor(private readonly promocionService: PromocionService) {}

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'promociones' })
  create(@Body() createPromocionDto: CreatePromocionDto) {
    return this.promocionService.create(createPromocionDto);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'promociones' })
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.promocionService.findAll(pagination);
  }

  @Get(':id')
  @RequirePermissions({ accion: 'leer', modulo: 'promociones' })
  findOne(@Param('id') id: string) {
    return this.promocionService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'promociones' })
  update(@Param('id') id: string, @Body() updatePromocionDto: UpdatePromocionDto) {
    return this.promocionService.update(id, updatePromocionDto);
  }

  @Delete(':id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'promociones' })
  remove(@Param('id') id: string) {
    return this.promocionService.remove(id);
  }

  @Post(':id/restore')
  @RequirePermissions({ accion: 'eliminar', modulo: 'promociones' })
  restore(@Param('id') id: string) {
    return this.promocionService.restore(id);
  }
}
