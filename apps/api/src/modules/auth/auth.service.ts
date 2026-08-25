import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
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
      include: { asignaciones_acceso: true }
    });

    // Validar contraseña usando crypto nativo (mismo nivel que bcrypt)
    const [salt, key] = user.contrasena_hash.split(':');
    const hashedBuffer = crypto.scryptSync(pass, salt, 64);
    
    const keyBuffer = Buffer.from(key, 'hex');
    const match = crypto.timingSafeEqual(hashedBuffer, keyBuffer);

    if (!match) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.asignaciones_acceso || user.asignaciones_acceso.length === 0) {
        throw new UnauthorizedException('Usuario sin organización asignada');
    }

    const payload = { 
        sub: user.id, 
        organizacion_id: user.asignaciones_acceso[0].organizacion_id 
    };
    
    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
          id: user.id,
          nombre: user.nombre_completo,
          organizacion_id: payload.organizacion_id
      }
    };
  }
}
