import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisClientType } from 'redis';
import { obtenerAccesoVigente } from '../../common/utils/acceso-vigente.util';
import { hashContrasena, verificarHash } from '../../common/utils/contrasena.util';
import { Intentos } from '../../common/limites/intentos';
import { LIMITES } from '../../common/limites/limites';
import * as crypto from 'crypto';
import { Inject } from '@nestjs/common';

interface SignInSuccessResult {
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

type SignInResult = SignInSuccessResult | SignInTenantSelectionResult;

/** El correo como clave del bloqueo: "Dueno@x.com " y "dueno@x.com" son la misma cuenta. */
export const cuentaDeCorreo = (correo: string) => correo.trim().toLowerCase();

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // Bloqueo por cuenta (docs/plan-seguridad.md, S3): muchas contraseñas
  // equivocadas para un mismo correo, desde cualquier IP, lo bloquean un rato.
  private readonly intentos: Intentos;
  // Para un correo que no existe se compara igual contra un hash cualquiera:
  // así responde en el mismo tiempo y no deja adivinar qué correos existen.
  private readonly hashFalso = hashContrasena(crypto.randomBytes(16).toString('hex'));

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
  ) {
    const { fallos, ventanaMs, bloqueoMs } = LIMITES.cuenta;
    this.intentos = new Intentos(redisClient, 'login', {
      maximo: fallos,
      ventanaMs,
      bloqueoMs,
      mensaje: `Demasiados intentos con esta cuenta. Espera ${Math.round(bloqueoMs / 60_000)} minutos o pide ayuda a quien administra tu gimnasio.`,
    });
  }

  async signIn(correo: string, pass: string, organizacionId?: string): Promise<SignInResult> {
    const cuenta = cuentaDeCorreo(correo);
    await this.intentos.revisar(cuenta);

    // Cliente crudo a propósito: en este punto todavía no hay ningún tenant
    // en el contexto (CLS) -- login es justamente la operación que determina
    // a qué organización(es) pertenece este usuario, así que no puede pasar
    // por el filtro RLS de extendedClient (que exige un organizacionId ya
    // resuelto para leer AsignacionAcceso, un modelo tenant-scoped, incluso
    // en su forma anidada por `include`). Replicamos a mano el único filtro
    // que extendedClient aplicaría igual (soft delete).
    //
    // Primero solo la contraseña guardada, y el resto de la cuenta recién con
    // la contraseña buena: así, exista o no el correo, el login tarda lo mismo
    // y no deja adivinar qué correos están registrados.
    const credencial = await this.prisma.usuario.findUnique({ where: { correo, deletedAt: null }, select: { id: true, contrasenaHash: true } });
    const valida = await verificarHash(pass, credencial?.contrasenaHash ?? (await this.hashFalso));
    if (!credencial || !valida) {
      if (await this.intentos.fallo(cuenta)) this.logger.warn(`Cuenta bloqueada por contraseñas equivocadas: ${cuenta}`);
      throw new UnauthorizedException('Credenciales inválidas');
    }
    await this.intentos.exito(cuenta);

    const user = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: credencial.id },
      include: {
        asignacionesAcceso: {
          include: {
            organizacion: true,
            sucursal: true,
            rol: true
          }
        },
        perfilStaff: { select: { organizacionId: true, deletedAt: true } },
      }
    });

    // Si la persona fue dada de baja del equipo de un gimnasio, ese gimnasio
    // deja de contar (mismo criterio que obtenerAccesoVigente).
    const asignaciones = user.asignacionesAcceso.filter(
      (a) => !(user.perfilStaff?.deletedAt && user.perfilStaff.organizacionId === a.organizacionId),
    );

    if (!user.isSuperAdmin && asignaciones.length === 0) {
        throw new UnauthorizedException('Usuario sin organización asignada');
    }

    let asignacionActiva = null;

    if (!user.isSuperAdmin) {
      if (organizacionId) {
        asignacionActiva = asignaciones.find(a => a.organizacionId === organizacionId);
        if (!asignacionActiva) {
          throw new UnauthorizedException('No tienes acceso a la organización seleccionada');
        }
      } else if (asignaciones.length > 1) {
        return {
          requireTenantSelection: true,
          tenants: asignaciones.map(a => ({
            organizacionId: a.organizacion?.id,
            nombre: a.organizacion?.nombre,
            sucursalNombre: a.sucursal?.nombre,
            rolNombre: a.rol?.nombre
          }))
        };
      } else {
        asignacionActiva = asignaciones[0];
      }
    }

    // El token solo identifica a la persona y su organización. Rol y
    // sucursal se resuelven en cada petición (JwtAuthGuard + acceso vigente)
    // para que un cambio de acceso aplique sin volver a iniciar sesión.
    const payload = { 
        sub: user.id, 
        organizacionId: asignacionActiva?.organizacionId || null,
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

  // Datos del usuario para hidratar el cliente (GET /auth/me). Recibe
  // `req.user`, que JwtAuthGuard ya completó con el acceso vigente (rol,
  // sucursal y nombre de la organización al día, no los del token); solo
  // faltan nombre/correo, que no viajan en el token, así que se buscan acá.
  async getMe(payload: {
    sub: string;
    organizacionId?: string;
    organizacionNombre?: string;
    sucursalId?: string;
    sucursalNombre?: string;
    rolNombre?: string;
    is_superadmin?: boolean;
    esCliente?: boolean;
  }) {
    const usuario = await this.prisma.extendedClient.usuario.findUnique({
      where: { id: payload.sub },
      select: { nombreCompleto: true, correo: true, sucursalPreferida: { select: { id: true, organizacionId: true, deletedAt: true } } },
    });
    // Fase 6 (DB-5): solo si la sucursal preferida es de esta organización.
    const preferida = usuario?.sucursalPreferida;
    const sucursalPreferidaId =
      preferida && !preferida.deletedAt && preferida.organizacionId === payload.organizacionId ? preferida.id : null;

    return {
      sub: payload.sub,
      nombre: usuario?.nombreCompleto ?? null,
      correo: usuario?.correo ?? null,
      organizacionId: payload.organizacionId ?? null,
      organizacionNombre: payload.organizacionNombre ?? null,
      sucursalId: payload.sucursalId ?? null,
      sucursalNombre: payload.sucursalNombre ?? null,
      rolNombre: payload.rolNombre ?? null,
      is_superadmin: !!payload.is_superadmin,
      // Portal del cliente: el frontend lo manda a /portal en vez de /dashboard.
      esCliente: !!payload.esCliente,
      sucursalPreferidaId,
    };
  }

  // Fase 6 (DB-5): la sucursal tiene que ser de la organización con la que
  // se trabaja, y solo la elige quien tiene acceso a todas.
  async guardarSucursalPreferida(payload: { sub: string; organizacionId?: string; sucursalId?: string }, sucursalId: string) {
    if (!payload.organizacionId) throw new BadRequestException('Elige primero una organización.');
    if (payload.sucursalId) throw new BadRequestException('Tu acceso está limitado a una sucursal: no puedes elegir otra.');
    const sucursal = await this.prisma.extendedClient.sucursal.findFirst({
      where: { id: sucursalId, organizacionId: payload.organizacionId },
      select: { id: true },
    });
    if (!sucursal) throw new BadRequestException('Esa sucursal no es de tu organización.');
    await this.prisma.extendedClient.usuario.update({ where: { id: payload.sub }, data: { sucursalPreferidaId: sucursalId } });
    return { sucursalPreferidaId: sucursalId };
  }

  async getPermisos(userId: string, organizacionId: string | undefined, isSuperAdmin: boolean): Promise<string[]> {
    // Sin caso especial para superadmin: sus permisos son los de su propio rol
    // global SUPERADMIN (AsignacionAcceso con organizacionId: null), igual que
    // cualquier otro usuario -- si esto devolviera "todo" el frontend mostraría
    // opciones que el backend luego rechaza (RolesGuard ya no hace bypass).
    const orgIdParaBuscar = isSuperAdmin ? null : organizacionId;
    if (!isSuperAdmin && !organizacionId) return [];

    const acceso = await obtenerAccesoVigente(this.prisma, this.redisClient, userId, orgIdParaBuscar ?? null);
    return acceso?.permisos ?? [];
  }

  async logout(token: string, payload: { exp?: number; sub?: string; organizacionId?: string; is_superadmin?: boolean; }): Promise<void> {
    try {
      // Calculate remaining TTL of the token
      const exp = payload.exp;
      if (!exp) return;
      const now = Math.floor(Date.now() / 1000);
      const ttl = exp - now;
      
      if (ttl > 0) {
        // Add to Redis blacklist with TTL
        await this.redisClient.setEx(`token:revoked:${token}`, ttl, 'true');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error('[AuthService] Error al invalidar token en Redis:', err.message);
      }
    }
  }
}
