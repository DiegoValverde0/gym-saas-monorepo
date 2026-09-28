import { Module } from '@nestjs/common';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';
import { AccesoPortalService } from './acceso-portal.service';

@Module({
  controllers: [ClientesController],
  providers: [ClientesService, AccesoPortalService],
})
export class ClientesModule {}
