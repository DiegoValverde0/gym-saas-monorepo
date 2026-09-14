import { Module } from '@nestjs/common';
import { AperturaCajaService } from './apertura-caja.service';
import { AperturaCajaController } from './apertura-caja.controller';

@Module({
  controllers: [AperturaCajaController],
  providers: [AperturaCajaService],
})
export class AperturaCajaModule {}
