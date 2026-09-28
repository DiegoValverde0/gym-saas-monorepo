import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { AccesoPortalService } from './acceso-portal.service';
import { DarAccesoPortalDto } from './dto/acceso-portal.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { ClientesQueryDto } from './dto/clientes-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clientes')
export class ClientesController {
  constructor(
    private readonly clientesService: ClientesService,
    private readonly accesoPortalService: AccesoPortalService,
  ) {}

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'clientes' })
  async create(@Body() createClienteDto: CreateClienteDto) {
    // Si viene la fecha string y necesitamos Date, Prisma lo casteará automáticamente 
    // si el formato es un ISO-8601 válido.
    return this.clientesService.create(createClienteDto);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'clientes' })
  async findAll(@Query() query: ClientesQueryDto) {
    return this.clientesService.findAll(query);
  }

  @Get(':id/ficha')
  @RequirePermissions({ accion: 'leer', modulo: 'clientes' })
  async ficha(@Param('id') id: string) {
    const ficha = await this.clientesService.ficha(id);
    return { ...ficha, accesoPortal: await this.accesoPortalService.estado(id) };
  }

  // Portal del cliente (docs/plan-portal-cliente.md, fase 2).
  @Post(':id/portal')
  @RequirePermissions({ accion: 'actualizar', modulo: 'clientes' })
  async darAccesoPortal(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DarAccesoPortalDto) {
    return this.accesoPortalService.darAcceso(id, dto.correo);
  }

  @Post(':id/portal/contrasena')
  @RequirePermissions({ accion: 'actualizar', modulo: 'clientes' })
  async nuevaContrasenaPortal(@Param('id', ParseUUIDPipe) id: string) {
    return this.accesoPortalService.nuevaContrasena(id);
  }

  @Delete(':id/portal')
  @RequirePermissions({ accion: 'actualizar', modulo: 'clientes' })
  async quitarAccesoPortal(@Param('id', ParseUUIDPipe) id: string) {
    return this.accesoPortalService.quitarAcceso(id);
  }

  @Get(':id')
  @RequirePermissions({ accion: 'leer', modulo: 'clientes' })
  async findOne(@Param('id') id: string) {
    return this.clientesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'clientes' })
  async update(@Param('id') id: string, @Body() updateClienteDto: UpdateClienteDto) {
    return this.clientesService.update(id, updateClienteDto);
  }

  @Delete(':id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'clientes' })
  async remove(@Param('id') id: string) {
    return this.clientesService.remove(id);
  }

  @Post(':id/restore')
  @RequirePermissions({ accion: 'eliminar', modulo: 'clientes' })
  async restore(@Param('id') id: string) {
    return this.clientesService.restore(id);
  }
}
