import { describe, expect, it } from 'vitest';
import {
  cuando,
  diaDeClase,
  elegirFrases,
  fraseCaja,
  fraseClase,
  fraseHoraPico,
  frasePorVencer,
  fraseRitmo,
  fraseSinVenir,
  fraseStock,
  horaMasLlena,
  vecesPorDiaDeSemana,
} from './para-saber';

describe('"Lo que hay que saber hoy"', () => {
  it('el ritmo del mes se dice desde ±10 % y desde el día 3', () => {
    expect(fraseRitmo({ mes: 118, mesPasado: 100, diaDelMes: 10, href: '/x' })?.texto).toBe('Vas 18 % arriba del mes pasado a esta altura.');
    expect(fraseRitmo({ mes: 88, mesPasado: 100, diaDelMes: 10, href: '/x' })).toMatchObject({ tono: 'atencion', texto: 'Vas 12 % abajo del mes pasado a esta altura.' });
    expect(fraseRitmo({ mes: 105, mesPasado: 100, diaDelMes: 10, href: '/x' })).toBeNull();
    expect(fraseRitmo({ mes: 200, mesPasado: 100, diaDelMes: 2, href: '/x' })).toBeNull();
    expect(fraseRitmo({ mes: 200, mesPasado: 0, diaDelMes: 10, href: '/x' })).toBeNull();
    expect(fraseRitmo({ mes: 1234.5, mesPasado: 1000, diaDelMes: 10, href: '/x' })?.detalle).toBe('Bs. 1234,50 este mes contra Bs. 1000,00 en los mismos días del mes pasado.');
  });

  it('cuenta en singular y en plural, y no dice nada con 0', () => {
    expect(fraseSinVenir(1, '/x')?.texto).toBe('1 cliente con membresía activa no viene hace 30 días o más.');
    expect(fraseSinVenir(12, '/x')?.texto).toBe('12 clientes con membresía activa no vienen hace 30 días o más.');
    expect(fraseSinVenir(0, '/x')).toBeNull();
    expect(frasePorVencer(1, '/x')?.texto).toBe('1 membresía vence en los próximos 3 días.');
    expect(frasePorVencer(4, '/x')?.texto).toBe('4 membresías vencen en los próximos 3 días.');
    expect(fraseStock(2, '/x')?.texto).toBe('2 productos están por acabarse.');
    expect(fraseStock(0, '/x')).toBeNull();
  });

  it('la hora pico: la casilla más llena, por semana, y solo con suficientes ingresos', () => {
    const pico = horaMasLlena([
      { dia: '2', hora: 19, cantidad: 140 },
      { dia: '1', hora: 7, cantidad: 90 },
      { dia: '4', hora: 19, cantidad: 140 },
    ]);
    // Empate: la más temprana de la semana.
    expect(pico).toEqual({ dia: '2', hora: 19, cantidad: 140 });
    const f = fraseHoraPico({ ...pico!, semanas: 4 }, 3000, '/x');
    expect(f?.texto).toBe('Tu hora más llena: los martes a las 19 h.');
    expect(f?.detalle).toBe('En los últimos 30 días entraron 140 personas a esa hora (unas 35 por semana).');
    expect(fraseHoraPico({ dia: '2', hora: 19, cantidad: 30, semanas: 4 }, 40, '/x')).toBeNull();
    expect(horaMasLlena([])).toBeNull();
  });

  it('cuenta cuántos lunes, martes… hay en un rango', () => {
    // Del jueves 3 de septiembre al viernes 2 de octubre de 2026 (30 días).
    const v = vecesPorDiaDeSemana('2026-09-03', '2026-10-03');
    expect(Object.values(v).reduce((a, b) => a + b, 0)).toBe(30);
    expect(v['4']).toBe(5); // jueves
    expect(v['5']).toBe(5); // viernes
    expect(v['1']).toBe(4); // lunes
  });

  it('la caja: faltante primero, sobrante como dato, y nada si cuadra', () => {
    expect(cuando('2026-10-02', '2026-10-02')).toBe('hoy');
    expect(cuando('2026-10-01', '2026-10-02')).toBe('ayer');
    expect(cuando('2026-09-28', '2026-10-02')).toBe('el lunes');
    expect(fraseCaja({ caja: 'Principal', fecha: '2026-10-01', diferencia: -20 }, '2026-10-02', '/x')).toMatchObject({
      importancia: 90,
      texto: 'La caja "Principal" cerró ayer con un faltante de Bs. 20,00.',
    });
    expect(fraseCaja({ caja: 'Principal', fecha: '2026-10-02', diferencia: 5.5 }, '2026-10-02', '/x')?.texto).toBe('La caja "Principal" cerró hoy con un sobrante de Bs. 5,50.');
    expect(fraseCaja({ caja: 'Principal', fecha: '2026-10-02', diferencia: 0 }, '2026-10-02', '/x')).toBeNull();
    expect(fraseCaja(null, '2026-10-02', '/x')).toBeNull();
  });

  it('las clases: la llena primero; si no, la más vacía de hoy o mañana', () => {
    const hoy = '2026-10-02'; // viernes
    expect(diaDeClase('2026-10-02', hoy)).toBe('de hoy');
    expect(diaDeClase('2026-10-03', hoy)).toBe('de mañana');
    expect(diaDeClase('2026-10-05', hoy)).toBe('del lunes');
    const llena = { nombre: 'Funcional', fecha: '2026-10-05', hora: '19:00', ocupados: 20, capacidad: 20 };
    const vacia = { nombre: 'Yoga', fecha: '2026-10-03', hora: '08:00', ocupados: 1, capacidad: 15 };
    expect(fraseClase([vacia, llena], hoy, '/x')?.texto).toBe('Funcional del lunes a las 19:00 está llena (20 de 20).');
    expect(fraseClase([{ ...llena, ocupados: 18 }], hoy, '/x')?.texto).toBe('Funcional del lunes a las 19:00 está casi llena (18 de 20).');
    expect(fraseClase([vacia], hoy, '/x')?.texto).toBe('Yoga de mañana a las 08:00 tiene 1 de 15 lugares ocupados.');
    // Una vacía de dentro de 3 días todavía se puede llenar: no se dice.
    expect(fraseClase([{ ...vacia, fecha: '2026-10-05' }], hoy, '/x')).toBeNull();
    expect(fraseClase([{ ...vacia, capacidad: 4, ocupados: 0 }], hoy, '/x')).toBeNull();
  });

  it('muestra hasta 4, lo urgente primero', () => {
    const frases = [
      fraseHoraPico({ dia: '2', hora: 19, cantidad: 140, semanas: 4 }, 3000, '/x'),
      fraseCaja({ caja: 'Principal', fecha: '2026-10-01', diferencia: -20 }, '2026-10-02', '/x'),
      null,
      fraseStock(2, '/x'),
      fraseSinVenir(5, '/x'),
      frasePorVencer(3, '/x'),
    ];
    expect(elegirFrases(frases).map((f) => f.clave)).toEqual(['caja', 'sin-venir', 'por-vencer', 'stock']);
  });
});
