import { Module } from '@nestjs/common';
import { PermisoService } from './permiso.service';
import { PermisoController } from './permiso.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    // JwtService ya es global (ver AuthModule): no volver a registrar JwtModule aquí.
    PrismaModule,
  ],
  controllers: [PermisoController],
  providers: [PermisoService],
})
export class PermisoModule {}
