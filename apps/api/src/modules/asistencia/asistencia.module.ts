import { Module } from '@nestjs/common';
import { AsistenciaService } from './asistencia.service';
import { AsistenciaController } from './asistencia.controller';
import { KioscoService } from './kiosco.service';

@Module({
  controllers: [AsistenciaController],
  providers: [AsistenciaService, KioscoService],
})
export class AsistenciaModule {}
