import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { SistemaService } from './sistema.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { IsString, IsNotEmpty } from 'class-validator';

export class RestaurarDto {
  @IsString()
  @IsNotEmpty()
  modelo: string;

  @IsString()
  @IsNotEmpty()
  id: string;
}

@Controller('sistema')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SistemaController {
  constructor(private readonly sistemaService: SistemaService) {}

  @Post('restaurar')
  @RequirePermissions({ modulo: 'sistema', accion: 'restaurar' })
  async restaurar(@Body() body: RestaurarDto) {
    return this.sistemaService.restaurar(body.modelo, body.id);
  }
}
