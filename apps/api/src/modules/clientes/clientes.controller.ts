import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'clientes' })
  async create(@Body() createClienteDto: CreateClienteDto) {
    // Si viene la fecha string y necesitamos Date, Prisma lo casteará automáticamente 
    // si el formato es un ISO-8601 válido.
    return this.clientesService.create(createClienteDto);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'clientes' })
  async findAll(@Query() pagination: PaginationQueryDto) {
    return this.clientesService.findAll(pagination);
  }

  @Get(':id')
  @RequirePermissions({ accion: 'leer', modulo: 'clientes' })
  async findOne(@Param('id') id: string) {
    return this.clientesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'clientes' })
  async update(@Param('id') id: string, @Body() updateClienteDto: UpdateClienteDto) {
    return this.clientesService.update(id, updateClienteDto as any);
  }

  @Delete(':id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'clientes' })
  async remove(@Param('id') id: string) {
    return this.clientesService.remove(id);
  }
}
