import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuditoriaService, ACCIONES_AUDITORIA } from './auditoria.service';

export class AuditoriaQueryDto extends PaginationQueryDto {
  // Fechas locales ("YYYY-MM-DD", ambas incluidas), en la zona horaria de la organización.
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @IsIn(ACCIONES_AUDITORIA)
  accion?: string;

  @IsOptional()
  @IsUUID()
  usuarioId?: string;
}

// Actividad de la organización (plan 11.8, experto). Mismo permiso que
// cambiar la configuración: la ve quien administra el gimnasio.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  @Get()
  @RequirePermissions({ accion: 'actualizar', modulo: 'organizaciones' })
  listar(@Query() q: AuditoriaQueryDto) {
    return this.auditoriaService.listar(q);
  }
}
