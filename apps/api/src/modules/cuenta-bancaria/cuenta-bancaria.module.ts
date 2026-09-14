import { Module } from '@nestjs/common';
import { CuentaBancariaService } from './cuenta-bancaria.service';
import { CuentaBancariaController } from './cuenta-bancaria.controller';

@Module({
  controllers: [CuentaBancariaController],
  providers: [CuentaBancariaService],
})
export class CuentaBancariaModule {}
