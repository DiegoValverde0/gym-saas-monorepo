// Avisos automáticos (docs/plan-avisos-automaticos.md): textos y claves,
// sin consultas. Los usan el proceso de cada hora, los avisos en el acto
// (lista de espera, sesión cancelada) y la lista de WhatsApp de recepción.

export type TipoAviso = 'POR_VENCER' | 'VENCE_HOY' | 'VENCIDA' | 'LUGAR' | 'CANCELADA' | 'RECORDATORIO';

// Días antes del vencimiento en que se avisa, y horas antes de una clase.
export const DIAS_AVISO_POR_VENCER = 3;
export const DIAS_AVISO_VENCIDA = 3;
export const HORAS_RECORDATORIO = 3;

/**
 * `notificaciones.tipo` (varchar 50): "TIPO:referencia". La referencia (id de
 * la membresía, la reserva o la clase) hace que el mismo aviso no se repita
 * aunque el proceso corra cada hora.
 */
export const tipoNotificacion = (tipo: TipoAviso, referencia: string) => `${tipo}:${referencia}`;
export const tipoDeNotificacion = (guardado: string): TipoAviso | null => {
  const tipo = guardado.split(':')[0] as TipoAviso;
  return ['POR_VENCER', 'VENCE_HOY', 'VENCIDA', 'LUGAR', 'CANCELADA', 'RECORDATORIO'].includes(tipo) ? tipo : null;
};

// Fechas "de reloj" (@db.Date, medianoche UTC): "28 de octubre".
export const fechaCorta = (fecha: Date) => fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/**
 * Cuándo es una clase, en la hora del gimnasio: "hoy a las 12:00",
 * "mañana a las 07:30" o "el miércoles 30 de septiembre a las 12:00".
 */
export function cuandoEsLaClase(fechaHora: Date, zonaHoraria: string, ahora = new Date()): string {
  const dia = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: zonaHoraria });
  const hora = fechaHora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: zonaHoraria });
  if (dia(fechaHora) === dia(ahora)) return `hoy a las ${hora}`;
  if (dia(fechaHora) === dia(new Date(ahora.getTime() + 86_400_000))) return `mañana a las ${hora}`;
  const fecha = fechaHora.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: zonaHoraria });
  return `el ${fecha} a las ${hora}`;
}

export interface DatosAviso {
  plan?: string;
  fechaFin?: Date;
  diasRestantes?: number;
  clase?: string;
  cuando?: string;
  sucursal?: string;
}

/** Título y mensaje, hablándole al cliente. */
export function textoAviso(tipo: TipoAviso, d: DatosAviso): { titulo: string; mensaje: string } {
  switch (tipo) {
    case 'POR_VENCER':
      return {
        titulo: 'Tu membresía vence pronto',
        mensaje: `Tu plan ${d.plan} vence el ${fechaCorta(d.fechaFin!)} (${d.diasRestantes === 1 ? 'mañana' : `en ${d.diasRestantes} días`}). Renuévalo en recepción para seguir entrenando sin cortes.`,
      };
    case 'VENCE_HOY':
      return { titulo: 'Tu membresía vence hoy', mensaje: `Hoy es el último día de tu plan ${d.plan}. Renuévalo en recepción para seguir entrenando.` };
    case 'VENCIDA':
      return { titulo: 'Tu membresía venció', mensaje: `Tu plan ${d.plan} venció el ${fechaCorta(d.fechaFin!)}. Cuando quieras, renuévalo en recepción.` };
    case 'LUGAR':
      return {
        titulo: '¡Ya tienes lugar!',
        mensaje: `Se liberó un lugar en ${d.clase} (${d.cuando}) y ya es tuyo. Si no puedes ir, cancélalo para dejárselo a otra persona.`,
      };
    case 'CANCELADA':
      return { titulo: 'Se canceló tu clase', mensaje: `El gimnasio canceló ${d.clase} (${d.cuando}). Tu reserva quedó anulada.` };
    case 'RECORDATORIO':
      return { titulo: 'Tu clase es pronto', mensaje: `${d.clase} es ${d.cuando} en ${d.sucursal}. ¡Te esperamos!` };
  }
}

/** Mensaje para mandar por WhatsApp desde recepción. */
export function textoWhatsapp(tipo: TipoAviso, nombreCliente: string, gimnasio: string, d: DatosAviso): string {
  const nombre = nombreCliente.split(' ')[0];
  return `Hola ${nombre}, te escribimos de ${gimnasio}. ${textoAviso(tipo, d).mensaje}`;
}
