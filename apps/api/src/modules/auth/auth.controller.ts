import { Controller, Post, Body, HttpCode, HttpStatus, Get, Request, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

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
