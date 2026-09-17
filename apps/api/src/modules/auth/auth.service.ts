import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { formatPermiso } from '../../common/utils/permiso.util';
import { promisify } from 'util';
import * as crypto from 'crypto';
import { Inject } from '@nestjs/common';

export interface SignInSuccessResult {
  access_token: string;
  user: {
    id: string;
    nombre: string;
    organizacionId: string | null;
    isSuperAdmin: boolean;
  };
}

export interface SignInTenantSelectionResult {
  requireTenantSelection: true;
  tenants: {
    organizacionId: string | undefined;
    nombre: string | undefined;
    sucursalNombre: string | undefined;
    rolNombre: string | undefined;
  }[];
}

export type SignInResult = SignInSuccessResult | SignInTenantSelectionResult;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    @Inject('REDIS_CLIENT') private readonly redisClient: Record<string, unknown>
  ) {}

  async signIn(correo: string, pass: string, organizacionId?: string): Promise<SignInResult> {
    // Cliente crudo a propósito: en este punto todavía no hay ningún tenant
    // en el contexto (CLS) -- login es justamente la operación que determina
    // a qué organización(es) pertenece este usuario, así que no puede pasar
    // por el filtro RLS de extendedClient (que exige un organizacionId ya
    // resuelto para leer AsignacionAcceso, un modelo tenant-scoped, incluso
    // en su forma anidada por `include`). Replicamos a mano el único filtro
    // que extendedClient aplicaría igual (soft delete).
    const user = await this.prisma.usuario.findUnique({
      where: { correo, deletedAt: null },
      include: {
        asignacionesAcceso: {
          include: {
            organizacion: true,
            sucursal: true,
            rol: true
          }
        }
      }
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Validar contraseña usando crypto nativo (mismo nivel que bcrypt)
    const [salt, key] = user.contrasenaHash.split(':');
    const scryptAsync = promisify(crypto.scrypt);
    const hashedBuffer = (await scryptAsync(pass, salt, 64)) as Buffer;
    
    const keyBuffer = Buffer.from(key, 'hex');
    const match = crypto.timingSafeEqual(hashedBuffer, keyBuffer);

    if (!match) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.isSuperAdmin && (!user.asignacionesAcceso || user.asignacionesAcceso.length === 0)) {
        throw new UnauthorizedException('Usuario sin organización asignada');
    }

    let asignacionActiva = null;

    if (!user.isSuperAdmin) {
      if (organizacionId) {
        asignacionActiva = user.asignacionesAcceso.find(a => a.organizacionId === organizacionId);
        if (!asignacionActiva) {
          throw new UnauthorizedException('No tienes acceso a la organización seleccionada');
        }
      } else if (user.asignacionesAcceso.length > 1) {
        return {
          requireTenantSelection: true,
          tenants: user.asignacionesAcceso.map(a => ({
            organizacionId: a.organizacion?.id,
            nombre: a.organizacion?.nombre,
            sucursalNombre: a.sucursal?.nombre,
            rolNombre: a.rol?.nombre
          }))
        };
      } else {
        asignacionActiva = user.asignacionesAcceso[0];
      }
    }

    const payload = { 
        sub: user.id, 
        organizacionId: asignacionActiva?.organizacionId || null,
        organizacionNombre: asignacionActiva?.organizacion?.nombre || null,
        sucursalId: asignacionActiva?.sucursalId || null,
        sucursalNombre: asignacionActiva?.sucursal?.nombre || null,
        rolNombre: asignacionActiva?.rol?.nombre || null,
        is_superadmin: user.isSuperAdmin,
    };
    
    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
          id: user.id,
          nombre: user.nombreCompleto,
          organizacionId: payload.organizacionId,
          isSuperAdmin: user.isSuperAdmin,
      }
    };
  }

  async getPermisos(userId: string, organizacionId: string | undefined, isSuperAdmin: boolean): Promise<string[]> {
    // Sin caso especial para superadmin: sus permisos son los de su propio rol
    // global SUPERADMIN (AsignacionAcceso con organizacionId: null), igual que
    // cualquier otro usuario -- si esto devolviera "todo" el frontend mostraría
    // opciones que el backend luego rechaza (RolesGuard ya no hace bypass).
    const orgIdParaBuscar = isSuperAdmin ? null : organizacionId;
    if (!isSuperAdmin && !organizacionId) return [];

    const asignacion = await this.prisma.extendedClient.asignacionAcceso.findFirst({
      where: {
        usuarioId: userId,
        organizacionId: orgIdParaBuscar,
      },
      include: {
        rol: {
          include: {
            rolPermisos: {
              include: { permiso: true }
            }
          }
        }
      }
    });

    if (!asignacion || !asignacion.rol) return [];

    return asignacion.rol.rolPermisos.map(rp => formatPermiso(rp.permiso.modulo, rp.permiso.accion));
  }

  async logout(token: string, payload: { exp?: number; sub?: string; organizacionId?: string; is_superadmin?: boolean; }): Promise<void> {
    try {
      // Calculate remaining TTL of the token
      const exp = payload.exp;
      if (!exp) return;
      const now = Math.floor(Date.now() / 1000);
      const ttl = exp - now;
      
      if (ttl > 0 && typeof this.redisClient.setEx === 'function') {
        // Add to Redis blacklist with TTL
        await (this.redisClient.setEx as (...args: unknown[]) => Promise<void>)(`token:revoked:${token}`, ttl, 'true');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error('[AuthService] Error al invalidar token en Redis:', err.message);
      }
    }
  }
}
