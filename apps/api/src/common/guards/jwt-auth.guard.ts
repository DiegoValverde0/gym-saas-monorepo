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
      // Sin `secret` explícito: usa el configurado globalmente en AuthModule (JWT_SECRET),
      // que ya falla al arrancar la app si no está definido.
      const payload = await this.jwtService.verifyAsync(token);
      
      // Inyectar el payload en la request
      request['user'] = payload;

      // PUNTO CRÍTICO: Inyectamos el organizacionId y is_superadmin en el CLS
      if (payload.is_superadmin && !payload.organizacionId) {
          // SYSTEM ADMIN REAL (Global, sin tenant vinculado)
          this.cls.set('is_superadmin', true);
          const tenantId = request.headers['x-tenant-id'];
          if (tenantId === 'all') {
              this.cls.set('organizacionId', undefined);
          } else if (tenantId && typeof tenantId === 'string') {
              this.cls.set('organizacionId', tenantId);
          }
      } else {
          // DUEÑO DE GYM O STAFF (Atado a un Tenant)
          if (payload.organizacionId) {
              this.cls.set('organizacionId', payload.organizacionId);
          } else {
              throw new UnauthorizedException('El token no contiene una organización válida');
          }
          if (payload.sucursalId) {
              this.cls.set('sucursalId', payload.sucursalId);
          }
          
          // Forzamos is_superadmin a falso para Prisma, así nunca se salta el RLS de su tenant
          this.cls.set('is_superadmin', false);
      }

    } catch (error) {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
