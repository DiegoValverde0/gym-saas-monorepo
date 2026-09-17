import { Controller, Post, Body, Get, Put, Delete, UseGuards, Param, ForbiddenException, Req } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { OrganizacionService } from './organizacion.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CrearOrganizacionDto } from './dto/crear-organizacion.dto';
import { UpdateMiOrganizacionDto } from './dto/update-mi-organizacion.dto';

interface RequestWithUser extends ExpressRequest {
  user?: {
    is_superadmin?: boolean;
  };
}

@Controller('organizaciones')
export class OrganizacionController {
  constructor(private readonly organizacionService: OrganizacionService) {}

  // ==============================================================
  // ENDPOINTS DE PLATAFORMA (SOLO SUPERADMIN)
  //
  // Además del permiso RBAC, cada uno valida explícitamente `is_superadmin`:
  // defensa en profundidad para que un permiso mal asignado a un rol de
  // tenant nunca sea suficiente por sí solo para tocar estos endpoints.
  // Nótese que no existe un PUT de edición total: el superadmin no puede
  // editar ningún dato interno de una organización, solo crearla o
  // suspenderla/reactivarla (ver Auditoria_Claude.md).
  // ==============================================================

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermissions({ accion: 'leer', modulo: 'organizaciones' })
  async getAllOrganizaciones(@Req() req: RequestWithUser): Promise<unknown> {
    this.assertSuperAdmin(req);
    return this.organizacionService.getAllOrganizaciones();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermissions({ accion: 'crear', modulo: 'organizaciones' })
  async registrarOrganizacion(@Req() req: RequestWithUser, @Body() body: CrearOrganizacionDto): Promise<unknown> {
    this.assertSuperAdmin(req);
    return this.organizacionService.crearOrganizacionConAdmin(body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermissions({ accion: 'suspender', modulo: 'organizaciones' })
  async suspenderOrganizacion(@Req() req: RequestWithUser, @Param('id') id: string): Promise<unknown> {
    this.assertSuperAdmin(req);
    return this.organizacionService.suspenderOrganizacion(id);
  }

  @Post(':id/restore')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermissions({ accion: 'suspender', modulo: 'organizaciones' })
  async reactivarOrganizacion(@Req() req: RequestWithUser, @Param('id') id: string): Promise<unknown> {
    this.assertSuperAdmin(req);
    return this.organizacionService.reactivarOrganizacion(id);
  }

  private assertSuperAdmin(req: RequestWithUser) {
    if (!req.user?.is_superadmin) {
      throw new ForbiddenException('Este endpoint es exclusivo del superadmin de plataforma.');
    }
  }

  // ==============================================================
  // ENDPOINTS PARA EL TENANT (Dueño del Gym)
  // Usamos el path "me/info" para diferenciarlos de los de plataforma
  // ==============================================================

  @Get('me/info')
  @UseGuards(JwtAuthGuard)
  async getMiOrganizacion(): Promise<unknown> {
    // Todos los usuarios autenticados de un tenant pueden ver la info de su propia org
    return this.organizacionService.getMiOrganizacion();
  }

  @Put('me/info')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermissions({ accion: 'actualizar', modulo: 'organizaciones' })
  async updateMiOrganizacion(@Body() data: UpdateMiOrganizacionDto): Promise<unknown> {
    return this.organizacionService.updateMiOrganizacion(data);
  }
}
