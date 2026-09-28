import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { RedisClientType } from 'redis';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { obtenerAccesoVigente, registrarActividad, sesionCerrada } from '../utils/acceso-vigente.util';
import { PERMITIR_CLIENTE_KEY } from '../decorators/permitir-cliente.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService, 
    private cls: ClsService,
    private prisma: PrismaService,
    private reflector: Reflector,
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // Leer token de la cookie (nuevo estándar) o fallback al header (para Swagger/Postman temporalmente)
    const token = request.cookies?.['gym_token'] || this.extractTokenFromHeader(request);
    
    if (!token) {
      throw new UnauthorizedException('Token no proporcionado');
    }
    
    let payload;
    try {
      // Sin `secret` explícito: usa el configurado globalmente en AuthModule (JWT_SECRET),
      // que ya falla al arrancar la app si no está definido.
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
      
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

    // PUNTO CRÍTICO: Inyectamos el organizacionId y is_superadmin en el CLS
    if (payload.is_superadmin && !payload.organizacionId) {
        // SYSTEM ADMIN REAL (Global, sin tenant vinculado)
        request['user'] = payload;
        this.cls.set('is_superadmin', true);
        const tenantId = request.headers['x-tenant-id'];
        if (tenantId === 'all') {
            this.cls.set('organizacionId', undefined);
        } else if (tenantId && typeof tenantId === 'string') {
            this.cls.set('organizacionId', tenantId);
        }
        return true;
    }

    // DUEÑO DE GYM O STAFF (Atado a un Tenant)
    if (!payload.organizacionId) {
        throw new UnauthorizedException('El token no contiene una organización válida');
    }

    // Rol y sucursal NO se toman del token (quedarían congelados hasta el
    // siguiente login): se leen del acceso vigente, cacheado en Redis e
    // invalidado en cada cambio de acceso.
    const acceso = await obtenerAccesoVigente(this.prisma, this.redisClient, payload.sub, payload.organizacionId);
    if (!acceso) {
        throw new UnauthorizedException('Ya no tienes acceso a esta organización. Si crees que es un error, habla con un administrador.');
    }

    // Portal del cliente: sus cuentas solo entran a las rutas marcadas con
    // @PermitirCliente() (las de /portal y las de la propia sesión). Cerrado
    // por defecto: aunque alguien le agregue permisos al rol CLIENTE, o una
    // ruta nueva solo pida sesión, un cliente no ve datos del gimnasio.
    const permitirCliente = this.reflector.getAllAndOverride<boolean>(PERMITIR_CLIENTE_KEY, [context.getHandler(), context.getClass()]);
    if (acceso.esCliente && !permitirCliente) {
        throw new ForbiddenException('Esta cuenta es del portal del cliente y no puede usar el panel del gimnasio.');
    }

    // "Cerrar sus sesiones" (Equipo) y "Restablecer contraseña" invalidan los
    // tokens emitidos antes de ese momento en esta organización.
    let cerrada = false;
    try {
        cerrada = await sesionCerrada(this.redisClient, payload.sub, payload.organizacionId, payload.iat);
        // Última actividad (se muestra en Equipo). Sin await: no demora la petición.
        registrarActividad(this.redisClient, payload.sub, payload.organizacionId).catch(() => {});
    } catch (err: unknown) {
        console.error('[JwtAuthGuard] Fallo al consultar sesiones en Redis (Fail-Open):', (err as Error).message);
    }
    if (cerrada) {
        throw new UnauthorizedException('Un administrador cerró tu sesión. Vuelve a iniciar sesión.');
    }

    request['user'] = {
        ...payload,
        organizacionNombre: acceso.organizacionNombre,
        sucursalId: acceso.sucursalId,
        sucursalNombre: acceso.sucursalNombre,
        rolNombre: acceso.rolNombre,
        esCliente: acceso.esCliente,
    };

    this.cls.set('organizacionId', payload.organizacionId);
    // Para la auditoría (common/utils/auditoria.util.ts).
    this.cls.set('usuarioId', payload.sub);
    this.cls.set('ip', request.ip);
    if (acceso.sucursalId) {
        this.cls.set('sucursalId', acceso.sucursalId);
    }
    
    // Forzamos is_superadmin a falso para Prisma, así nunca se salta el RLS de su tenant
    this.cls.set('is_superadmin', false);
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
