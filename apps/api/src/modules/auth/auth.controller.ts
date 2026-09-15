import { Controller, Post, Body, HttpCode, HttpStatus, Get, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // Límite estricto de intentos para frenar fuerza bruta de contraseñas:
  // 5 intentos por minuto por IP (el resto de la API usa el límite global
  // de ThrottlerModule.forRoot en app.module.ts).
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  signIn(@Body() signInDto: Record<string, any>) {
    return this.authService.signIn(signInDto.correo, signInDto.contrasena);
  }

  @UseGuards(JwtAuthGuard)
  @Get('permisos')
  getPermisos(@Request() req: any) {
    const user = req.user;
    let organizacionId = user.organizacionId;
    
    if (user.is_superadmin) {
      organizacionId = req.headers['x-tenant-id'] === 'all' ? undefined : req.headers['x-tenant-id'];
    }
    
    return this.authService.getPermisos(user.sub, organizacionId, user.is_superadmin);
  }
}
