import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsuarioService {
  constructor(private prisma: PrismaService) {}

  async listarUsuarios(): Promise<any> {
    // Si RLS está bien configurado en BD, esta consulta jamás traerá usuarios de otra organización.
    // Usamos el extendedClient para que se aplique el RLS automáticamente
    return this.prisma.extendedClient.asignacion_Acceso.findMany({
      include: {
        usuario: true,
        rol: true
      }
    });
  }
}
