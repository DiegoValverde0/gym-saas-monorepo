import { Module } from '@nestjs/common';
import { AperturaCajaService } from './apertura-caja.service';
import { AperturaCajaController } from './apertura-caja.controller';
import { CierreDiaService } from './cierre-dia.service';

@Module({
  controllers: [AperturaCajaController],
  providers: [AperturaCajaService, CierreDiaService],
})
export class AperturaCajaModule {}
