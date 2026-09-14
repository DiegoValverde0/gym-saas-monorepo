import { Module } from '@nestjs/common';
import { SucursalService } from './sucursal.service';
import { SucursalController } from './sucursal.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    // JwtService ya es global (ver AuthModule): no volver a registrar JwtModule aquí.
    PrismaModule,
  ],
  controllers: [SucursalController],
  providers: [SucursalService],
})
export class SucursalModule {}
