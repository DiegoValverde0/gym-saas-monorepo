import { describe, expect, it } from 'vitest';
import { cuandoEsLaClase, textoAviso, textoWhatsapp, tipoDeNotificacion, tipoNotificacion } from './avisos.util';

const LA_PAZ = 'America/La_Paz'; // UTC-4

describe('avisos: textos y claves', () => {
  it('el tipo guardado lleva la referencia y cabe en varchar(50)', () => {
    const tipo = tipoNotificacion('RECORDATORIO', '5f7b5b6e-1111-4c2b-9d7a-0123456789ab');
    expect(tipo.length).toBeLessThanOrEqual(50);
    expect(tipoDeNotificacion(tipo)).toBe('RECORDATORIO');
    expect(tipoDeNotificacion('OTRA_COSA:1')).toBeNull();
  });

  it('cuándo es la clase, en la hora del gimnasio', () => {
    const ahora = new Date('2026-09-28T14:00:00Z'); // 10:00 en La Paz
    expect(cuandoEsLaClase(new Date('2026-09-28T16:00:00Z'), LA_PAZ, ahora)).toBe('hoy a las 12:00');
    // 01:30 UTC del 29 = 21:30 del 28 en La Paz: sigue siendo hoy.
    expect(cuandoEsLaClase(new Date('2026-09-29T01:30:00Z'), LA_PAZ, ahora)).toBe('hoy a las 21:30');
    expect(cuandoEsLaClase(new Date('2026-09-29T11:00:00Z'), LA_PAZ, ahora)).toBe('mañana a las 07:00');
    expect(cuandoEsLaClase(new Date('2026-09-30T16:00:00Z'), LA_PAZ, ahora)).toBe('el miércoles, 30 de septiembre a las 12:00');
  });

  it('mensajes para el cliente y para WhatsApp', () => {
    const fechaFin = new Date('2026-10-28T00:00:00Z');
    expect(textoAviso('POR_VENCER', { plan: 'Mensual', fechaFin, diasRestantes: 3 }).mensaje).toContain('vence el 28 de octubre (en 3 días)');
    expect(textoAviso('POR_VENCER', { plan: 'Mensual', fechaFin, diasRestantes: 1 }).mensaje).toContain('(mañana)');
    expect(textoWhatsapp('LUGAR', 'Rosa Pérez', 'Gym Titan', { clase: 'Spinning', cuando: 'mañana a las 12:00' })).toBe(
      'Hola Rosa, te escribimos de Gym Titan. Se liberó un lugar en Spinning (mañana a las 12:00) y ya es tuyo. Si no puedes ir, cancélalo para dejárselo a otra persona.',
    );
  });
});
