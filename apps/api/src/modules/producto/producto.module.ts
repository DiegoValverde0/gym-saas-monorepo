import { Module } from '@nestjs/common';
import { ProductoService } from './producto.service';
import { ProductoController } from './producto.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    // JwtService ya es global (ver AuthModule): no volver a registrar JwtModule aquí.
    PrismaModule,
  ],
  controllers: [ProductoController],
  providers: [ProductoService],
})
export class ProductoModule {}
