import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModuloActivoGuard } from '../../common/guards/modulo-activo.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequiereModulo } from '../../common/decorators/requiere-modulo.decorator';
import { AccesoClasesService } from './acceso-clases.service';
import { DisciplinasDelPlanDto, ReglaDisciplinaDto } from './dto/acceso-clases.dto';

@UseGuards(JwtAuthGuard, RolesGuard, ModuloActivoGuard)
@RequiereModulo('clasesGrupales')
@Controller('acceso-clases')
export class AccesoClasesController {
  constructor(private readonly accesoClasesService: AccesoClasesService) {}

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'clases' })
  obtener() {
    return this.accesoClasesService.obtener();
  }

  @Put('disciplinas/:disciplinaId')
  @RequirePermissions({ accion: 'actualizar', modulo: 'disciplinas' })
  definirReglaDisciplina(@Param('disciplinaId', ParseUUIDPipe) disciplinaId: string, @Body() dto: ReglaDisciplinaDto) {
    return this.accesoClasesService.definirReglaDisciplina(disciplinaId, dto);
  }

  @Put('planes/:planId')
  @RequirePermissions({ accion: 'actualizar', modulo: 'planes' })
  definirDisciplinasDelPlan(@Param('planId', ParseUUIDPipe) planId: string, @Body() dto: DisciplinasDelPlanDto) {
    return this.accesoClasesService.definirDisciplinasDelPlan(planId, dto);
  }
}
