import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Rutas /portal: solo cuentas con el rol CLIENTE y enlazadas a una ficha de
 * cliente de esta organización (clientes.usuario_id, DB-6). Deja el id de esa
 * ficha en el contexto: las rutas del portal nunca reciben un clienteId desde
 * el navegador, así nadie puede ver ni reservar a nombre de otro.
 * Va después de JwtAuthGuard, que ya puso la organización en el contexto.
 */
@Injectable()
export class PortalClienteGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly cls: ClsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { sub?: string; esCliente?: boolean } | undefined;
    if (!user?.sub || !user.esCliente) {
      throw new ForbiddenException('El portal es solo para clientes del gimnasio.');
    }
    // Con RLS: solo fichas de esta organización y no eliminadas.
    const cliente = await this.prisma.extendedClient.cliente.findFirst({
      where: { usuarioId: user.sub },
      select: { id: true },
    });
    if (!cliente) {
      throw new ForbiddenException('Tu cuenta no está enlazada a una ficha de cliente. Pide ayuda en recepción.');
    }
    this.cls.set('clienteId', cliente.id);
    return true;
  }
}
