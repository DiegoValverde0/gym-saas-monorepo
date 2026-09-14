import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error(
    'JWT_SECRET no está configurado. Define la variable de entorno JWT_SECRET antes de iniciar la aplicación.',
  );
}

@Module({
  imports: [
    // JwtModule se registra como global aquí: ningún otro módulo debe volver
    // a registrarlo, solo importar JwtService donde haga falta.
    JwtModule.register({
      global: true,
      secret: jwtSecret,
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
