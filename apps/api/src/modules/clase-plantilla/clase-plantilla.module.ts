import { Module } from '@nestjs/common';
import { ClasePlantillaService } from './clase-plantilla.service';
import { ClasePlantillaController } from './clase-plantilla.controller';

@Module({
  controllers: [ClasePlantillaController],
  providers: [ClasePlantillaService],
})
export class ClasePlantillaModule {}
