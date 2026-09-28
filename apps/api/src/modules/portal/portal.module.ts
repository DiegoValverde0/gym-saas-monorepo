import { Module } from '@nestjs/common';
import { ReservaClaseModule } from '../reserva-clase/reserva-clase.module';
import { AvisosModule } from '../avisos/avisos.module';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { PortalClienteGuard } from './portal-cliente.guard';

@Module({
  imports: [ReservaClaseModule, AvisosModule],
  controllers: [PortalController],
  providers: [PortalService, PortalClienteGuard],
})
export class PortalModule {}
