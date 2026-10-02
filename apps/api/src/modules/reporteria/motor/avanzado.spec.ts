import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { desdeHoraLocal } from '../../../common/utils/zona-horaria.util';
import { tipoReporte } from '../catalogo';
import { analizarLogica, sqlDeLogica } from './avanzado';
import { compilarReporte, ContextoEjecucion } from './compilador';
import { validarDefinicion } from './definicion';

const LA_PAZ = 'America/La_Paz';
const ctx: ContextoEjecucion = {
  organizacionId: '11111111-1111-4111-8111-111111111111',
  usuarioId: '22222222-2222-4222-8222-222222222222',
  zonaHoraria: LA_PAZ,
  hoy: new Date('2026-09-30T00:00:00Z'),
  inicioDelDia: (fecha) => desdeHoraLocal(new Date(`${fecha}T00:00:00Z`), 0, LA_PAZ),
};
const experto = { avanzado: true };

function compilar(clave: string, d: Record<string, unknown>) {
  const tipo = tipoReporte(clave)!;
  return compilarReporte(tipo, validarDefinicion({ tipo: clave, ...d }, tipo, experto), ctx);
}

describe('lógica de filtros', () => {
  const sql = (logica: string, n: number) => {
    const conds = Array.from({ length: n }, (_, i) => Prisma.raw(`c${i + 1}`));
    return sqlDeLogica(analizarLogica(logica, n).arbol, conds).text;
  };

  it('Y antes que O, paréntesis y NO; acepta AND/OR/NOT', () => {
    expect(sql('1 O 2 Y 3', 3)).toBe('(c1 OR (c2 AND c3))');
    expect(sql('(1 o 2) y 3', 3)).toBe('((c1 OR c2) AND c3)');
    expect(sql('NOT 1 AND (2 OR 3)', 3)).toBe('((NOT c1) AND (c2 OR c3))');
    expect(analizarLogica('1 and (2 or 3)', 3).normalizada).toBe('1 Y (2 O 3)');
  });

  it('errores claros y nada que no sea lógica', () => {
    expect(() => analizarLogica('1 Y 4', 3)).toThrow('usa el filtro 4, pero hay 3');
    expect(() => analizarLogica('1 Y 2', 3)).toThrow('no usa el filtro 3');
    expect(() => analizarLogica('(1 Y 2', 2)).toThrow('paréntesis');
    expect(() => analizarLogica('1 Y 2; DROP TABLE x', 2)).toThrow();
    expect(() => analizarLogica('1 DROP 2', 2)).toThrow('no es parte de la lógica');
  });

  it('el compilador combina los filtros con la lógica', () => {
    const r = compilar('ventas', {
      columnas: ['monto'],
      filtros: {
        campos: [
          { columna: 'monto', operador: 'mayor', valor: 100 },
          { columna: 'concepto', operador: 'en', valores: ['PRODUCTO'] },
          { columna: 'cliente', operador: 'vacio' },
        ],
        logica: '1 O (2 Y 3)',
      },
    });
    expect(r.resumen.text).toMatch(/\(\(d\.subtotal > \$\d+::numeric\) OR \(\(d\.tipo_concepto::text IN \(\$\d+\)\) AND \(c\.nombre IS NULL OR c\.nombre = ''\)\)\)/);
  });
});

describe('grupos personalizados', () => {
  const tramos = {
    clave: 'gp1',
    nombre: 'Tamaño de la venta',
    columna: 'monto',
    rangos: [
      { hasta: 100, etiqueta: 'Chica' },
      { hasta: 500, etiqueta: 'Mediana' },
    ],
    otros: 'Grande',
  };

  it('tramos: CASE con etiquetas como parámetros y un orden propio para agrupar', () => {
    const r = compilar('ventas', { formato: 'AGRUPADO', columnas: ['monto'], gruposPersonalizados: [tramos], agrupaciones: [{ columna: 'gp1' }] });
    expect(r.resumen.text).toMatch(/CASE WHEN d\.subtotal < \$\d+::numeric THEN \$\d+::text WHEN d\.subtotal < \$\d+::numeric THEN \$\d+::text ELSE \$\d+::text END\) AS g0/);
    expect(r.resumen.values).toEqual(expect.arrayContaining(['Chica', 'Mediana', 'Grande', 100, 500]));
    // Ordena por el tramo (Chica, Mediana, Grande), no alfabéticamente.
    expect(r.resumen.text).toContain('GROUPING SETS ((g0, og0), ())');
    expect(r.resumen.text).toContain('ORDER BY og0 NULLS LAST, g0 NULLS LAST');
  });

  it('conjuntos de valores de una lista, validados contra sus opciones', () => {
    const conjunto = { clave: 'gp1', nombre: 'Tipo', columna: 'concepto', valores: [{ etiqueta: 'Planes', valores: ['MEMBRESIA'] }], otros: 'Lo demás' };
    const r = compilar('ventas', { columnas: ['gp1', 'monto'], gruposPersonalizados: [conjunto] });
    expect(r.resumen.text).toContain('d.tipo_concepto::text::text IN (');
    const mal = { ...conjunto, valores: [{ etiqueta: 'X', valores: ['NO_EXISTE'] }] };
    expect(() => compilar('ventas', { columnas: ['gp1'], gruposPersonalizados: [mal] })).toThrow('no es un valor');
  });

  it('los tramos tienen que subir', () => {
    const mal = { ...tramos, rangos: [{ hasta: 500, etiqueta: 'A' }, { hasta: 100, etiqueta: 'B' }] };
    expect(() => compilar('ventas', { columnas: ['gp1'], gruposPersonalizados: [mal] })).toThrow('más alto que el anterior');
  });
});

describe('tabla cruzada', () => {
  it('cada nivel con y sin la columna: casillas, totales de fila, de columna y general', () => {
    const r = compilar('ventas', {
      formato: 'TABLA_CRUZADA',
      agrupaciones: [{ columna: 'sucursal' }],
      columnaCruzada: { columna: 'fecha', granularidad: 'mes' },
      totales: [{ columna: 'monto', funcion: 'suma' }],
    });
    expect(r.resumen.text).toContain('GROUPING SETS ((g0, gc), (g0), (gc), ())');
    expect(r.resumen.text).toContain('GROUPING(gc) AS xc');
    expect(r.filas).toBeNull();
  });

  it('una sola medida y filas distintas de las columnas', () => {
    const tipo = tipoReporte('ventas')!;
    const base = { tipo: 'ventas', formato: 'TABLA_CRUZADA', agrupaciones: [{ columna: 'sucursal' }], columnaCruzada: { columna: 'concepto' } };
    expect(() => validarDefinicion({ ...base, totales: [{ columna: 'monto', funcion: 'suma' }, { columna: 'cantidad', funcion: 'suma' }] }, tipo, experto)).toThrow('un solo total');
    expect(() => validarDefinicion({ ...base, columnaCruzada: { columna: 'sucursal' } }, tipo, experto)).toThrow('distintas');
  });
});

describe('filtros con / sin', () => {
  it('clientes SIN asistencias en los últimos 30 días: NOT EXISTS con el rango en hora del gimnasio', () => {
    const r = compilar('clientes', { columnas: ['cliente'], filtros: { cruzados: [{ clave: 'asistencias', modo: 'sin', rango: 'ultimos_30' }] } });
    expect(r.resumen.text).toMatch(/NOT EXISTS \(SELECT 1 FROM registros_asistencia ra WHERE ra\.cliente_id = c\.id AND ra\.deleted_at IS NULL AND ra\.fecha_hora_ingreso >= \$\d+ AND ra\.fecha_hora_ingreso < \$\d+\)/);
    const instantes = r.resumen.values.filter((v): v is Date => v instanceof Date).map((d) => d.toISOString());
    expect(instantes).toEqual(['2026-09-01T04:00:00.000Z', '2026-10-01T04:00:00.000Z']);
  });

  it('solo los del catálogo de ese tipo', () => {
    expect(() => compilar('ventas', { columnas: ['monto'], filtros: { cruzados: [{ clave: 'asistencias', modo: 'con' }] } })).toThrow('no tiene el filtro');
  });
});

describe('modo experto', () => {
  it('fuera del modo experto no se arman funciones avanzadas', () => {
    const tipo = tipoReporte('clientes')!;
    const d = { tipo: 'clientes', columnas: ['cliente'], filtros: { cruzados: [{ clave: 'compras', modo: 'sin' }] } };
    expect(() => validarDefinicion(d, tipo)).toThrow('modo experto');
    expect(() => validarDefinicion(d, tipo, experto)).not.toThrow();
  });
});
