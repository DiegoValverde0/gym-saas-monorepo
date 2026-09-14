import { Module } from '@nestjs/common';
import { AsistenciaService } from './asistencia.service';
import { AsistenciaController } from './asistencia.controller';

@Module({
  controllers: [AsistenciaController],
  providers: [AsistenciaService],
})
export class AsistenciaModule {}
