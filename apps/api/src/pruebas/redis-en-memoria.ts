// Solo para las pruebas (no se compila: ver "exclude" en tsconfig.json). Un
// Redis en memoria con lo que usan los contadores de intentos
// (common/limites/intentos.ts): get, del, pTTL y multi con incr, pExpire, set
// y del. El tiempo no corre: lo que vence, vence con avanzar(ms).

interface Valor {
  dato: string;
  /** Cuándo vence (ms del reloj falso), o undefined si no vence. */
  vence?: number;
}

export function redisEnMemoria() {
  const datos = new Map<string, Valor>();
  let ahora = 0;
  const vivo = (k: string) => {
    const v = datos.get(k);
    if (v && v.vence !== undefined && v.vence <= ahora) datos.delete(k);
    return datos.get(k);
  };
  const incr = (k: string) => {
    const n = Number(vivo(k)?.dato ?? 0) + 1;
    datos.set(k, { dato: String(n), vence: datos.get(k)?.vence });
    return n;
  };
  const pExpire = (k: string, ms: number, modo?: 'NX') => {
    const v = vivo(k);
    if (!v || (modo === 'NX' && v.vence !== undefined)) return 0;
    v.vence = ahora + ms;
    return 1;
  };
  const set = (k: string, dato: string, opciones?: { PX?: number }) => {
    datos.set(k, { dato, vence: opciones?.PX !== undefined ? ahora + opciones.PX : undefined });
    return 'OK';
  };
  const del = (k: string) => (datos.delete(k) ? 1 : 0);

  return {
    datos,
    /** Hace correr el reloj falso. */
    avanzar: (ms: number) => {
      ahora += ms;
    },
    get: async (k: string) => vivo(k)?.dato ?? null,
    del: async (k: string) => del(k),
    pTTL: async (k: string) => {
      const v = vivo(k);
      if (!v) return -2;
      return v.vence === undefined ? -1 : v.vence - ahora;
    },
    multi() {
      const ops: (() => unknown)[] = [];
      const cadena = {
        incr: (k: string) => (ops.push(() => incr(k)), cadena),
        pExpire: (k: string, ms: number, modo?: 'NX') => (ops.push(() => pExpire(k, ms, modo)), cadena),
        set: (k: string, dato: string, opciones?: { PX?: number }) => (ops.push(() => set(k, dato, opciones)), cadena),
        del: (k: string) => (ops.push(() => del(k)), cadena),
        exec: async () => ops.map((op) => op()),
      };
      return cadena;
    },
  };
}
