import { Controller, Get, UseGuards } from '@nestjs/common';
import { PermisoService } from './permiso.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('permisos')
export class PermisoController {
  constructor(private readonly permisoService: PermisoService) {}

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'roles' }) // Requiere poder gestionar roles para ver permisos
  findAll() {
    return this.permisoService.findAll();
  }
}
