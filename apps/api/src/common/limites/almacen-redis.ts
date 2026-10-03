import { Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { RedisClientType } from 'redis';

// El paquete no exporta el tipo del resultado: sale de la interfaz.
type Registro = Awaited<ReturnType<ThrottlerStorage['increment']>>;

// Los contadores de los límites de peticiones en Redis (docs/plan-seguridad.md,
// decisión S2): sobreviven a un reinicio de la API y se comparten si hay más
// de una. Hace lo mismo que el almacén en memoria de @nestjs/throttler: al
// pasar el límite bloquea por `blockDuration` y, al terminar el bloqueo, la
// cuenta empieza de nuevo. Todo en un script de Redis, así contar y bloquear
// es un solo paso aunque lleguen muchos pedidos juntos.
//
// KEYS[1]: el contador; KEYS[2]: la marca de bloqueo.
// ARGV: ventana (ms), límite, duración del bloqueo (ms).
// Devuelve: pedidos, ms hasta que se reinicie la cuenta, bloqueado (0/1), ms de bloqueo.
const CONTAR = `
local bloqueo = redis.call('PTTL', KEYS[2])
if bloqueo > 0 then
  return { tonumber(redis.call('GET', KEYS[1]) or '0'), redis.call('PTTL', KEYS[1]), 1, bloqueo }
end
local pedidos = redis.call('INCR', KEYS[1])
if pedidos == 1 or redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local vence = redis.call('PTTL', KEYS[1])
if pedidos > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  redis.call('DEL', KEYS[1])
  return { pedidos, vence, 1, tonumber(ARGV[3]) }
end
return { pedidos, vence, 0, 0 }
`;

const segundos = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

export class AlmacenLimitesRedis implements ThrottlerStorage {
  private readonly logger = new Logger(AlmacenLimitesRedis.name);

  constructor(private readonly redis: RedisClientType) {}

  async increment(clave: string, ttl: number, limite: number, bloqueo: number, nombre: string): Promise<Registro> {
    try {
      const [pedidos, vence, bloqueado, tiempoBloqueo] = (await this.redis.eval(CONTAR, {
        keys: [`limite:${nombre}:${clave}`, `limite:${nombre}:${clave}:bloqueo`],
        arguments: [String(ttl), String(limite), String(bloqueo || ttl)],
      })) as number[];
      return { totalHits: pedidos, timeToExpire: segundos(vence), isBlocked: bloqueado === 1, timeToBlockExpire: segundos(tiempoBloqueo) };
    } catch (error) {
      // Sin Redis, la API sigue atendiendo (los límites son una capa más, no la
      // única): se avisa en el registro para arreglarlo.
      this.logger.error(`No se pudo contar el pedido en Redis: ${(error as Error).message}`);
      return { totalHits: 0, timeToExpire: segundos(ttl), isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
