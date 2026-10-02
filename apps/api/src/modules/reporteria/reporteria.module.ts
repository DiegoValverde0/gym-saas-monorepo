import { Module } from '@nestjs/common';
import { ReporteriaController } from './reporteria.controller';
import { ReporteriaService } from './reporteria.service';
import { ReportesGuardadosService } from './reportes-guardados.service';

@Module({
  controllers: [ReporteriaController],
  providers: [ReporteriaService, ReportesGuardadosService],
})
export class ReporteriaModule {}
