import { Module } from '@nestjs/common';
import { GastoPlantillaService } from './gasto-plantilla.service';
import { GastoPlantillaController } from './gasto-plantilla.controller';

@Module({
  controllers: [GastoPlantillaController],
  providers: [GastoPlantillaService],
})
export class GastoPlantillaModule {}
