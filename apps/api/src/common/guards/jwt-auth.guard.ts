import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { RedisClientType } from 'redis';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService, 
    private cls: ClsService,
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // Leer token de la cookie (nuevo estándar) o fallback al header (para Swagger/Postman temporalmente)
    const token = request.cookies?.['gym_token'] || this.extractTokenFromHeader(request);
    
    if (!token) {
      throw new UnauthorizedException('Token no proporcionado');
    }
    
    try {
      // Sin `secret` explícito: usa el configurado globalmente en AuthModule (JWT_SECRET),
      // que ya falla al arrancar la app si no está definido.
      const payload = await this.jwtService.verifyAsync(token);
      
      let isRevokedToken = false;
      let isRevokedUser = false;
      try {
        isRevokedToken = !!(await this.redisClient.get(`token:revoked:${token}`));
        isRevokedUser = !!(await this.redisClient.get(`user:revoked:${payload.sub}`));
      } catch (err: unknown) {
        console.error('[JwtAuthGuard] Fallo al verificar Redis (Fail-Open):', (err as Error).message);
      }

      if (isRevokedToken) {
         throw new UnauthorizedException('La sesión ha sido cerrada. Por favor, inicie sesión nuevamente.');
      }
      if (isRevokedUser) {
         throw new UnauthorizedException('La sesión ha sido revocada por el administrador.');
      }

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
