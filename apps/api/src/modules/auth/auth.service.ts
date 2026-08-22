import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

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

    // MVP: Comparación directa de strings, asumiendo contraseñas como "hashed_password_123" en seed
    if (user?.contrasena_hash !== pass) {
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
