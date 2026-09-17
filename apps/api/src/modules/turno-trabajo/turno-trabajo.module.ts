import { Module } from '@nestjs/common';
import { TurnoTrabajoService } from './turno-trabajo.service';
import { TurnoTrabajoController } from './turno-trabajo.controller';

@Module({
  controllers: [TurnoTrabajoController],
  providers: [TurnoTrabajoService],
})
export class TurnoTrabajoModule {}
