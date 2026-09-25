import { Controller, Get, Post, Body, Query, Req, UseGuards } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { AperturaCajaService } from './apertura-caja.service';
import { CreateAperturaCajaDto } from './dto/create-apertura-caja.dto';
import { CloseAperturaCajaDto } from './dto/close-apertura-caja.dto';
import { CerrarDiaDto, ResumenDiaQueryDto } from './dto/cierre-dia.dto';
import { CierreDiaService } from './cierre-dia.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

interface RequestWithUser extends ExpressRequest {
  user: {
    sub: string;
    sucursalId?: string;
  };
}

// Nota: NO se gatea con @RequiereModulo('puntoVenta') -- el checkout de
// membresías (POSModal en el frontend) depende de /apertura-caja/me sin
// importar si "Punto de Venta e Inventario" está activo; ese toggle solo
// controla la venta de artículos sueltos (ver producto/inventario.controller.ts).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('apertura-caja')
export class AperturaCajaController {
  constructor(
    private readonly aperturaCajaService: AperturaCajaService,
    private readonly cierreDiaService: CierreDiaService,
  ) {}

  // "Cerrar el día" del modo simple (plan 11.6): resumen de cobros y gastos
  // de hoy en la sucursal, y el cierre con el efectivo contado.
  @Get('dia')
  @RequirePermissions({ accion: 'leer', modulo: 'aperturas_caja' })
  resumenDia(@Query() query: ResumenDiaQueryDto) {
    return this.cierreDiaService.resumen(query.sucursalId);
  }

  @Post('cerrar-dia')
  @RequirePermissions({ accion: 'crear', modulo: 'aperturas_caja' })
  cerrarDia(@Body() dto: CerrarDiaDto, @Req() req: RequestWithUser) {
    return this.cierreDiaService.cerrar(dto, req.user.sub);
  }

  @Post('abrir')
  @RequirePermissions({ accion: 'crear', modulo: 'aperturas_caja' })
  abrirCaja(@Body() createAperturaCajaDto: CreateAperturaCajaDto, @Req() req: RequestWithUser) {
    const userId = req.user.sub;
    return this.aperturaCajaService.abrirCaja(createAperturaCajaDto, userId, req.user.sucursalId);
  }

  @Get('me')
  @RequirePermissions({ accion: 'leer', modulo: 'aperturas_caja' })
  estadoActual(@Req() req: RequestWithUser) {
    const userId = req.user.sub;
    // La organizacionId se extrae automaticamente por prisma extended client en el backend,
    // pero debemos asegurarnos de que la busqueda use el RLS adecuado.
    return this.aperturaCajaService.estadoActual(userId);
  }

  @Post('cerrar')
  @RequirePermissions({ accion: 'crear', modulo: 'aperturas_caja' })
  cerrarCaja(@Body() closeDto: CloseAperturaCajaDto, @Req() req: RequestWithUser) {
    const userId = req.user.sub;
    return this.aperturaCajaService.cerrarCaja(closeDto, userId);
  }
}
