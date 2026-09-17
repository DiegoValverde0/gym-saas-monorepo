import { Module } from '@nestjs/common';
import { ClaseProgramadaService } from './clase-programada.service';
import { ClaseProgramadaController } from './clase-programada.controller';

@Module({
  controllers: [ClaseProgramadaController],
  providers: [ClaseProgramadaService],
})
export class ClaseProgramadaModule {}
