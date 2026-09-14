import { Module } from '@nestjs/common';
import { MembresiaService } from './membresia.service';
import { MembresiaController } from './membresia.controller';

@Module({
  controllers: [MembresiaController],
  providers: [MembresiaService],
})
export class MembresiaModule {}
