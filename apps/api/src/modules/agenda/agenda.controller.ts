import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { AgendaService } from './agenda.service';
import { AgendaSemanaDto } from './dto/agenda-semana.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

interface RequestWithUser extends ExpressRequest {
  user: { sub: string };
}

// Sin @RequirePermissions ni @RequiereModulo a propósito: la agenda combina
// clases (clases:leer + módulo clasesGrupales) y turnos (turnos:leer + módulo
// controlPersonal), y muestra la parte que el usuario pueda ver. El chequeo
// fino se hace en AgendaService.
@UseGuards(JwtAuthGuard)
@Controller('agenda')
export class AgendaController {
  constructor(private readonly agendaService: AgendaService) {}

  @Get('semana')
  semana(@Query() query: AgendaSemanaDto, @Req() req: RequestWithUser) {
    return this.agendaService.semana(query, req.user.sub);
  }
}
