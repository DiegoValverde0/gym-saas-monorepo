import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * A quién se le cuentan los pedidos (docs/plan-seguridad.md, fase 2): con una
 * sesión válida, a esa persona; sin sesión (iniciar sesión, por ejemplo), a la
 * IP. Todo el personal de un gimnasio suele salir a internet por la misma IP
 * (el router del local): contando solo por IP compartirían un mismo límite.
 * La firma del token se verifica, así que inventar tokens no da más pedidos.
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
    return aQuienSeCuenta(token, (t) => this.jwt.verifyAsync(t), String(req.ip));
  }
}
