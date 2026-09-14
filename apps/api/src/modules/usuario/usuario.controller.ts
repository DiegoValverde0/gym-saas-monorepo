import { Controller, Get, Post, Body, Put, Param, Delete, UseGuards } from '@nestjs/common';
import { UsuarioService } from './usuario.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@Controller('usuario')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsuarioController {
  constructor(private readonly usuarioService: UsuarioService) {}

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'usuarios' })
  async listarUsuarios(): Promise<any> {
    return this.usuarioService.listarUsuarios();
  }

  @Post('empleado')
  @RequirePermissions({ accion: 'crear', modulo: 'usuarios' })
  async registrarEmpleado(@Body() data: any): Promise<any> {
    return this.usuarioService.registrarEmpleado(data);
  }

  @Put('asignacion/:id')
  @RequirePermissions({ accion: 'actualizar', modulo: 'usuarios' })
  async updateAsignacion(@Param('id') id: string, @Body() body: { rolId: string; sucursalId?: string | null }): Promise<any> {
    return this.usuarioService.updateAsignacion(id, body.rolId, body.sucursalId);
  }

  @Delete('asignacion/:id')
  @RequirePermissions({ accion: 'eliminar', modulo: 'usuarios' })
  async removerEmpleado(@Param('id') id: string): Promise<any> {
    return this.usuarioService.removerEmpleado(id);
  }
}
