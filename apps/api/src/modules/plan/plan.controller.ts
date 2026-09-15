import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { PlanService } from './plan.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('planes')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'planes' })
  create(@Body() createPlanDto: CreatePlanDto) {
    return this.planService.create(createPlanDto);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'planes' })
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.planService.findAll(pagination);
  }

  @Get(':id')
  @RequirePermissions({ accion: 'leer', modulo: 'planes' })
  findOne(@Param('id') id: string) {
    return this.planService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'planes' })
  update(@Param('id') id: string, @Body() updatePlanDto: UpdatePlanDto) {
    return this.planService.update(id, updatePlanDto);
  }

  @Delete(':id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'planes' })
  remove(@Param('id') id: string) {
    return this.planService.remove(id);
  }

  @Post(':id/restore')
  @RequirePermissions({ accion: 'eliminar', modulo: 'planes' })
  restore(@Param('id') id: string) {
    return this.planService.restore(id);
  }
}
