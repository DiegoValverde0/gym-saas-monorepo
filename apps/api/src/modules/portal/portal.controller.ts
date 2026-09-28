import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermitirCliente } from '../../common/decorators/permitir-cliente.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PortalClienteGuard } from './portal-cliente.guard';
import { PortalService } from './portal.service';
import { AvisosService } from '../avisos/avisos.service';
import { CambiarContrasenaPortalDto, ReservarClasePortalDto } from './dto/portal.dto';

interface RequestWithUser extends ExpressRequest {
  user: { sub: string };
}

// Portal del cliente (docs/plan-portal-cliente.md). Sin @RequirePermissions:
// el rol CLIENTE no tiene permisos y el acceso lo decide PortalClienteGuard.
@UseGuards(JwtAuthGuard, PortalClienteGuard)
@PermitirCliente()
@Controller('portal')
export class PortalController {
  constructor(
    private readonly portalService: PortalService,
    private readonly avisosService: AvisosService,
  ) {}

  @Get('yo')
  async yo(@Req() req: RequestWithUser) {
    const [yo, avisosSinLeer] = await Promise.all([this.portalService.yo(), this.avisosService.sinLeer(req.user.sub)]);
    return { ...yo, avisosSinLeer };
  }

  // Avisos automáticos (docs/plan-avisos-automaticos.md).
  @Get('avisos')
  avisos(@Req() req: RequestWithUser) {
    return this.avisosService.avisosDe(req.user.sub);
  }

  @Post('avisos/leidos')
  @HttpCode(HttpStatus.OK)
  marcarLeidos(@Req() req: RequestWithUser) {
    return this.avisosService.marcarLeidos(req.user.sub);
  }

  @Get('membresias')
  membresias() {
    return this.portalService.membresias();
  }

  @Get('asistencias')
  asistencias(@Query() query: PaginationQueryDto) {
    return this.portalService.asistencias(query);
  }

  @Get('clases')
  clases() {
    return this.portalService.clases();
  }

  @Post('clases/:id/reservar')
  reservar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReservarClasePortalDto) {
    return this.portalService.reservar(id, dto.listaEspera);
  }

  @Post('reservas/:id/cancelar')
  @HttpCode(HttpStatus.OK)
  cancelar(@Param('id', ParseUUIDPipe) id: string) {
    return this.portalService.cancelar(id);
  }

  @Put('contrasena')
  cambiarContrasena(@Req() req: RequestWithUser, @Body() dto: CambiarContrasenaPortalDto) {
    return this.portalService.cambiarContrasena(req.user.sub, dto.actual, dto.nueva);
  }
}
