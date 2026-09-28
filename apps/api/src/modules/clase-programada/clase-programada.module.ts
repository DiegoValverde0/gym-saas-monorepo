import { Module } from '@nestjs/common';
import { ClaseProgramadaService } from './clase-programada.service';
import { ClaseProgramadaController } from './clase-programada.controller';
import { AvisosModule } from '../avisos/avisos.module';

@Module({
  imports: [AvisosModule],
  controllers: [ClaseProgramadaController],
  providers: [ClaseProgramadaService],
})
export class ClaseProgramadaModule {}
