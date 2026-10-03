import { HttpException, HttpStatus } from '@nestjs/common';
import type { RedisClientType } from 'redis';

/**
 * 429 con los segundos que faltan: GlobalExceptionFilter los pone en la
 * cabecera Retry-After, como hace el límite de peticiones.
 */
export class DemasiadosIntentosException extends HttpException {
  constructor(
    mensaje: string,
    readonly segundos: number,
  ) {
    super(mensaje, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export interface ReglaIntentos {
  /** Fallos que se permiten antes de bloquear. */
  maximo: number;
  /** En cuánto tiempo se cuentan, desde el primero (ms). */
  ventanaMs: number;
  /** Cuánto dura el bloqueo (ms). */
  bloqueoMs: number;
  /** Lo que se le dice a quien quedó bloqueado. */
  mensaje: string;
}

/**
 * Intentos fallidos con bloqueo, en Redis (docs/plan-seguridad.md, fase 2): la
 * contraseña de cada cuenta, los documentos y el PIN del kiosco y el PIN del
 * personal. `clave` dice qué se protege (por ejemplo, el correo).
 */
export class Intentos {
  constructor(
    private readonly redis: RedisClientType,
    private readonly prefijo: string,
    private readonly regla: ReglaIntentos,
  ) {}

  private claves(clave: string) {
    return { fallos: `intentos:${this.prefijo}:${clave}`, bloqueo: `intentos:${this.prefijo}:${clave}:bloqueo` };
  }

  /** Corta con 429 si está bloqueado. */
  async revisar(clave: string): Promise<void> {
    const restante = await this.redis.pTTL(this.claves(clave).bloqueo);
    if (restante > 0) throw new DemasiadosIntentosException(this.regla.mensaje, Math.ceil(restante / 1000));
  }

  /**
   * Suma un fallo (la ventana empieza con el primero) y, al llegar al máximo,
   * bloquea y empieza la cuenta de nuevo. Devuelve true si con este quedó
   * bloqueado. Dos fallos en el mismo instante pueden dejar pasar uno más: para
   * esto no importa, y así se arma con órdenes simples (fáciles de probar).
   */
  async fallo(clave: string): Promise<boolean> {
    const { fallos, bloqueo } = this.claves(clave);
    const [cuenta] = await this.redis.multi().incr(fallos).pExpire(fallos, this.regla.ventanaMs, 'NX').exec();
    if (Number(cuenta) < this.regla.maximo) return false;
    await this.redis.multi().set(bloqueo, '1', { PX: this.regla.bloqueoMs }).del(fallos).exec();
    return true;
  }

  /** Un intento bueno borra los fallos (no un bloqueo que ya empezó). */
  async exito(clave: string): Promise<void> {
    await this.redis.del(this.claves(clave).fallos);
  }
}
