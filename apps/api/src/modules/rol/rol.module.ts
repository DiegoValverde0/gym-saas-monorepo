import { Module } from '@nestjs/common';
import { RolService } from './rol.service';
import { RolController } from './rol.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    // JwtService ya es global (ver AuthModule): no volver a registrar JwtModule aquí.
    PrismaModule,
  ],
  controllers: [RolController],
  providers: [RolService],
})
export class RolModule {}
