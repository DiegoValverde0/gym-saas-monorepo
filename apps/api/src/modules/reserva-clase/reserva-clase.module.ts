import { Module } from '@nestjs/common';
import { ReservaClaseService } from './reserva-clase.service';
import { ReservaClaseController } from './reserva-clase.controller';
import { AvisosModule } from '../avisos/avisos.module';

@Module({
  imports: [AvisosModule],
  controllers: [ReservaClaseController],
  providers: [ReservaClaseService],
  // El portal del cliente reserva y cancela con las mismas reglas.
  exports: [ReservaClaseService],
})
export class ReservaClaseModule {}
