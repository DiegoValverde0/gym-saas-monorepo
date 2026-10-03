import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { HORAS_SESION } from './sesion';

// JWT_SECRET ya se revisó al arrancar (main.ts, revisarEntorno): está y, en
// producción, es largo y no es el de muestra.
const jwtSecret = process.env.JWT_SECRET;

@Module({
  imports: [
    // JwtModule se registra como global aquí: ningún otro módulo debe volver
    // a registrarlo, solo importar JwtService donde haga falta.
    JwtModule.register({
      global: true,
      secret: jwtSecret,
      signOptions: { expiresIn: `${HORAS_SESION}h` },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
