import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AvisosService } from './avisos.service';

// "Avisos para enviar" por WhatsApp (docs/plan-avisos-automaticos.md): para
// quienes venden y atienden (dueño y recepción).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('avisos')
export class AvisosController {
  constructor(private readonly avisosService: AvisosService) {}

  @Get('whatsapp')
  @RequirePermissions({ accion: 'crear', modulo: 'membresias' })
  listaWhatsapp() {
    return this.avisosService.listaWhatsapp();
  }

  @Post('whatsapp/:clave/hecho')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions({ accion: 'crear', modulo: 'membresias' })
  marcarHecho(@Param('clave') clave: string) {
    return this.avisosService.marcarHecho(clave);
  }
}
