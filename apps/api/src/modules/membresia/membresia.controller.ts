import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { MembresiaService } from './membresia.service';
import { CreateMembresiaDto } from './dto/create-membresia.dto';
import { UpdateMembresiaDto } from './dto/update-membresia.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('membresias')
export class MembresiaController {
  constructor(private readonly membresiaService: MembresiaService) {}

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'membresias' })
  create(@Body() createMembresiaDto: CreateMembresiaDto, @Req() req: any) {
    const userId = req.user.sub;
    return this.membresiaService.create(createMembresiaDto, userId);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'membresias' })
  findAll() {
    return this.membresiaService.findAll();
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
}
