import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { normalizeIp, ThrottlerGuard } from '@nestjs/throttler';

/**
 * A quién se le cuentan los pedidos (docs/plan-seguridad.md, fase 2): con una
 * sesión válida, a esa persona; sin sesión (iniciar sesión, por ejemplo), a la
 * IP. Todo el personal de un gimnasio suele salir a internet por la misma IP
 * (el router del local): contando solo por IP compartirían un mismo límite.
 * La firma del token se verifica, así que inventar tokens no da más pedidos.
 *
 * Las IP pasan por normalizeIp (de @nestjs/throttler): una IPv6 cuenta por su
 * red (/64), porque quien tiene una red IPv6 tiene millones de direcciones y
 * podría usar una distinta en cada pedido; una IPv4 escrita como IPv6
 * (::ffff:1.2.3.4) cuenta como la IPv4.
 */
export async function aQuienSeCuenta(token: string | undefined, verificar: (token: string) => Promise<{ sub?: string }>, ip: string): Promise<string> {
  if (token) {
    try {
      const { sub } = await verificar(token);
      if (sub) return `usuario:${sub}`;
    } catch {
      // Token vencido o falso: se cuenta como sin sesión.
    }
  }
  return `ip:${ip}`;
}

@Injectable()
export class LimiteGuard extends ThrottlerGuard {
  @Inject(JwtService) private readonly jwt!: JwtService;

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const cookies = req.cookies as Record<string, string> | undefined;
    const autorizacion = (req.headers as Record<string, string | undefined> | undefined)?.authorization;
    // Las mismas dos fuentes que JwtAuthGuard: la cookie y, si no, la cabecera.
    const token = cookies?.['gym_token'] ?? (autorizacion?.startsWith('Bearer ') ? autorizacion.slice(7) : undefined);
    return aQuienSeCuenta(token, (t) => this.jwt.verifyAsync(t), normalizeIp(String(req.ip), this.ipv6SubnetPrefix));
  }
}
