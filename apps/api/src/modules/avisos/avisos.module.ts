import { Module } from '@nestjs/common';
import { AvisosController } from './avisos.controller';
import { AvisosService } from './avisos.service';
import { AvisosProgramadosService } from './avisos-programados.service';

@Module({
  controllers: [AvisosController],
  providers: [AvisosService, AvisosProgramadosService],
  // Reservas, sesiones y el portal avisan en el acto.
  exports: [AvisosService],
})
export class AvisosModule {}
