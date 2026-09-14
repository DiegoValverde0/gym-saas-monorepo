import { Module } from '@nestjs/common';
import { CajaRegistradoraService } from './caja-registradora.service';
import { CajaRegistradoraController } from './caja-registradora.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    // JwtService ya es global (ver AuthModule): no volver a registrar JwtModule aquí.
    PrismaModule,
  ],
  controllers: [CajaRegistradoraController],
  providers: [CajaRegistradoraService],
})
export class CajaRegistradoraModule {}
