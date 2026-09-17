import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { DisciplinaService } from './disciplina.service';
import { CreateDisciplinaDto } from './dto/create-disciplina.dto';
import { UpdateDisciplinaDto } from './dto/update-disciplina.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('disciplinas')
export class DisciplinaController {
  constructor(private readonly disciplinaService: DisciplinaService) {}

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'disciplinas' })
  create(@Body() createDisciplinaDto: CreateDisciplinaDto) {
    return this.disciplinaService.create(createDisciplinaDto);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'disciplinas' })
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.disciplinaService.findAll(pagination);
  }

  @Get(':id')
  @RequirePermissions({ accion: 'leer', modulo: 'disciplinas' })
  findOne(@Param('id') id: string) {
    return this.disciplinaService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'disciplinas' })
  update(@Param('id') id: string, @Body() updateDisciplinaDto: UpdateDisciplinaDto) {
    return this.disciplinaService.update(id, updateDisciplinaDto);
  }

  @Delete(':id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'disciplinas' })
  remove(@Param('id') id: string) {
    return this.disciplinaService.remove(id);
  }
}
