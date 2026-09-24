import { Module } from '@nestjs/common';
import { PersonalService } from './personal.service';
import { PersonalController } from './personal.controller';
import { TurnoPlantillaModule } from '../turno-plantilla/turno-plantilla.module';

@Module({
  imports: [TurnoPlantillaModule],
  controllers: [PersonalController],
  providers: [PersonalService],
})
export class PersonalModule {}
