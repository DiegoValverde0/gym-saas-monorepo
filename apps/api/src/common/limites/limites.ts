// Los límites de peticiones de la API, en un solo lugar (docs/plan-seguridad.md,
// fase 2). Cada uno se puede cambiar con su variable de entorno; sin ella, vale
// lo de abajo. Se leen una vez, al arrancar. Los pedidos se cuentan por persona
// si traen una sesión válida, y por IP si no (ver limite.guard.ts).

const MINUTO = 60_000;

/** Un número entero positivo de una variable de entorno, o el valor por defecto. */
export function enteroDeEntorno(entorno: NodeJS.ProcessEnv, variable: string, porDefecto: number): number {
  const valor = Number(entorno[variable]);
  return Number.isInteger(valor) && valor > 0 ? valor : porDefecto;
}

export function leerLimites(entorno: NodeJS.ProcessEnv = process.env) {
  const n = (variable: string, porDefecto: number) => enteroDeEntorno(entorno, variable, porDefecto);
  return {
    /** Toda la API (las pruebas e2e lo suben: cada pantalla hace varios pedidos). */
    general: { limit: n('LIMITE_GENERAL', 100), ttl: MINUTO },
    /** Iniciar sesión (sin sesión, así que por IP): frena probar contraseñas desde una misma máquina. */
    login: { limit: n('LIMITE_LOGIN', 5), ttl: MINUTO },
    /** Lo que más carga al servidor (exportar a Excel o CSV, crear un gimnasio). */
    pesado: { limit: n('LIMITE_PESADO', 10), ttl: MINUTO },
    /** Correr un reporte: el Inicio corre unos 10 en cada visita. */
    reportes: { limit: n('LIMITE_REPORTES', 120), ttl: MINUTO },
    /**
     * Bloqueo por cuenta: tras `fallos` contraseñas equivocadas en `ventana`
     * minutos para un mismo correo (desde cualquier IP), ese correo espera
     * `bloqueo` minutos.
     */
    cuenta: {
      fallos: n('LOGIN_FALLOS_MAX', 10),
      ventanaMs: n('LOGIN_FALLOS_VENTANA_MIN', 15) * MINUTO,
      bloqueoMs: n('LOGIN_BLOQUEO_MIN', 15) * MINUTO,
    },
  };
}

export const LIMITES = leerLimites();
