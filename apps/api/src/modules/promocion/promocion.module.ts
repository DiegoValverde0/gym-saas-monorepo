import { Module } from '@nestjs/common';
import { PromocionService } from './promocion.service';
import { PromocionController } from './promocion.controller';

@Module({
  controllers: [PromocionController],
  providers: [PromocionService],
})
export class PromocionModule {}
