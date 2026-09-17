import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Query } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { MembresiaService } from './membresia.service';
import { CreateMembresiaDto } from './dto/create-membresia.dto';
import { UpdateMembresiaDto } from './dto/update-membresia.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

interface RequestWithUser extends ExpressRequest {
  user: { sub: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('membresias')
export class MembresiaController {
  constructor(private readonly membresiaService: MembresiaService) {}

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'membresias' })
  create(@Body() createMembresiaDto: CreateMembresiaDto, @Req() req: RequestWithUser) {
    const userId = req.user.sub;
    return this.membresiaService.create(createMembresiaDto, userId);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'membresias' })
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.membresiaService.findAll(pagination);
  }

  @Get('cliente/:clienteId')
  @RequirePermissions({ accion: 'leer', modulo: 'membresias' })
  findByCliente(@Param('clienteId') clienteId: string) {
    return this.membresiaService.findByCliente(clienteId);
  }

  @Get(':id')
  @RequirePermissions({ accion: 'leer', modulo: 'membresias' })
  findOne(@Param('id') id: string) {
    return this.membresiaService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'membresias' })
  update(@Param('id') id: string, @Body() updateMembresiaDto: UpdateMembresiaDto) {
    return this.membresiaService.update(id, updateMembresiaDto);
  }

  @Delete(':id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'membresias' })
  remove(@Param('id') id: string) {
    return this.membresiaService.remove(id);
  }

  @Post(':id/restore')
  @RequirePermissions({ accion: 'eliminar', modulo: 'membresias' })
  restore(@Param('id') id: string) {
    return this.membresiaService.restore(id);
  }
}
