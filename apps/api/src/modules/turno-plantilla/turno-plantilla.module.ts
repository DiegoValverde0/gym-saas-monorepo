import { Module } from '@nestjs/common';
import { TurnoPlantillaService } from './turno-plantilla.service';
import { TurnoPlantillaController } from './turno-plantilla.controller';

@Module({
  controllers: [TurnoPlantillaController],
  providers: [TurnoPlantillaService],
})
export class TurnoPlantillaModule {}
