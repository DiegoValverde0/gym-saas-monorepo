import { Module } from '@nestjs/common';
import { ReservaClaseService } from './reserva-clase.service';
import { ReservaClaseController } from './reserva-clase.controller';

@Module({
  controllers: [ReservaClaseController],
  providers: [ReservaClaseService],
})
export class ReservaClaseModule {}
