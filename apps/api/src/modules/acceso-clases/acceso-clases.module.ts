import { Module } from '@nestjs/common';
import { AccesoClasesService } from './acceso-clases.service';
import { AccesoClasesController } from './acceso-clases.controller';

@Module({
  controllers: [AccesoClasesController],
  providers: [AccesoClasesService],
})
export class AccesoClasesModule {}
