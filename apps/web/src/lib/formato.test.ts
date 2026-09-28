import { describe, expect, it } from 'vitest';
import { bs, fechaISO, NOMBRE_CONCEPTO, NOMBRE_PAGO } from './formato';

describe('formatos', () => {
  it('muestra montos en bolivianos con dos decimales', () => {
    expect(bs(300)).toBe('Bs. 300,00');
    expect(bs(1234.5)).toMatch(/^Bs\. 1\.?234,50$/);
  });

  it('fechaISO usa la fecha local del navegador, no la de UTC', () => {
    // 27 de septiembre a las 23:30 locales: toISOString daría el 28 en UTC-4.
    expect(fechaISO(new Date(2026, 8, 27, 23, 30))).toBe('2026-09-27');
    expect(fechaISO(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('tiene nombre legible para cada forma de pago y concepto del esquema', () => {
    for (const metodo of ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'QR', 'PAGO_MOVIL', 'OTRO']) expect(NOMBRE_PAGO[metodo]).toBeTruthy();
    for (const c of ['MEMBRESIA', 'PRODUCTO', 'SERVICIO', 'OTRO', 'ALQUILER', 'SERVICIOS_BASICOS', 'NOMINA', 'INSUMOS', 'MANTENIMIENTO', 'IMPUESTOS', 'OTRO_GASTO']) {
      expect(NOMBRE_CONCEPTO[c]).toBeTruthy();
    }
  });
});
