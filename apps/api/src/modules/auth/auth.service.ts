import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { formatPermiso } from '../../common/utils/permiso.util';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService
  ) {}

  async signIn(correo: string, pass: string): Promise<any> {
    const user = await this.prisma.extendedClient.usuario.findUnique({
      where: { correo },
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
    const hashedBuffer = crypto.scryptSync(pass, salt, 64);
    
    const keyBuffer = Buffer.from(key, 'hex');
    const match = crypto.timingSafeEqual(hashedBuffer, keyBuffer);

    if (!match) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.isSuperAdmin && (!user.asignacionesAcceso || user.asignacionesAcceso.length === 0)) {
        throw new UnauthorizedException('Usuario sin organización asignada');
    }

    const asignacionActiva = user.asignacionesAcceso?.[0];

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
}
