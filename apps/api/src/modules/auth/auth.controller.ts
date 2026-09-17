import { Controller, Post, Body, HttpCode, HttpStatus, Get, Request, UseGuards, Res } from '@nestjs/common';
import { Response, Request as ExpressRequest } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { SignInDto } from './dto/sign-in.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

interface RequestWithUser extends ExpressRequest {
  user: {
    sub: string;
    organizacionId?: string;
    is_superadmin?: boolean;
  };
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // Límite estricto de intentos para frenar fuerza bruta de contraseñas:
  // 5 intentos por minuto por IP (el resto de la API usa el límite global
  // de ThrottlerModule.forRoot en app.module.ts).
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async signIn(@Body() signInDto: SignInDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.signIn(signInDto.correo, signInDto.contrasena, signInDto.organizacionId);
    
    if ('requireTenantSelection' in result && result.requireTenantSelection) {
      return result;
    }

    if ('access_token' in result) {
      res.cookie('gym_token', result.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
      });
      return { user: result.user, access_token: result.access_token };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req: RequestWithUser, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.['gym_token'] || req.headers.authorization?.split(' ')[1];
    if (token) {
      await this.authService.logout(token, req.user);
    }
    res.clearCookie('gym_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    return { message: 'Sesión terminada' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('permisos')
  getPermisos(@Request() req: RequestWithUser) {
    const user = req.user;
    let organizacionId = user.organizacionId;
    
    if (user.is_superadmin) {
      const rawTenant = req.headers['x-tenant-id'];
      const tenantStr = Array.isArray(rawTenant) ? rawTenant[0] : rawTenant;
      organizacionId = tenantStr === 'all' ? undefined : tenantStr;
    }
    
    return this.authService.getPermisos(user.sub, organizacionId, user.is_superadmin);
  }
}
