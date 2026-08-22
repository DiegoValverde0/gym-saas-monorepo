import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService, private cls: ClsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    
    if (!token) {
      throw new UnauthorizedException('Token no proporcionado');
    }
    
    try {
      const payload = await this.jwtService.verifyAsync(
        token,
        {
          secret: process.env.JWT_SECRET || 'gym_saas_super_secret_jwt_key_2026'
        }
      );
      
      // Inyectar el payload en la request
      request['user'] = payload;

      // PUNTO CRÍTICO: Inyectamos el organizacion_id en el CLS para la extensión RLS de Prisma
      if (payload.organizacion_id) {
          this.cls.set('organizacion_id', payload.organizacion_id);
      } else {
          throw new UnauthorizedException('El token no contiene una organización válida');
      }

    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
