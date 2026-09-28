import { describe, expect, it } from 'vitest';
import { desdeHoraLocal } from '../../../common/utils/zona-horaria.util';
import { TIPOS_REPORTE, tipoReporte } from '../catalogo';
import { compilarReporte, ContextoEjecucion } from './compilador';
import { validarDefinicion } from './definicion';
import { rangoDeFechas } from './fechas';

const ORG = '11111111-1111-4111-8111-111111111111';
const USUARIO = '22222222-2222-4222-8222-222222222222';
const SUCURSAL = '33333333-3333-4333-8333-333333333333';
const LA_PAZ = 'America/La_Paz';

function contexto(extra: Partial<ContextoEjecucion> = {}): ContextoEjecucion {
  return {
    organizacionId: ORG,
    usuarioId: USUARIO,
    zonaHoraria: LA_PAZ,
    hoy: new Date('2026-09-30T00:00:00Z'),
    inicioDelDia: (fecha) => desdeHoraLocal(new Date(`${fecha}T00:00:00Z`), 0, LA_PAZ),
    ...extra,
  };
}

function compilar(clave: string, definicion: Record<string, unknown>, ctx = contexto()) {
  const tipo = tipoReporte(clave)!;
  return compilarReporte(tipo, validarDefinicion({ tipo: clave, ...definicion }, tipo), ctx);
}

describe('compilador de reportes', () => {
  it('toda consulta de todo tipo filtra la organización (y la papelera si la tabla la tiene)', () => {
    for (const tipo of TIPOS_REPORTE) {
      const r = compilar(tipo.clave, {
        formato: 'AGRUPADO',
        columnas: tipo.columnas.map((c) => c.clave),
        agrupaciones: [{ columna: tipo.columnas.find((c) => c.tipo === 'texto')!.clave }],
      });
      for (const consulta of [r.resumen, r.filas!(1, 50)]) {
        expect(consulta.text).toContain(`${tipo.tabla.alias}.organizacion_id = $`);
        expect(consulta.values).toContain(ORG);
        if (tipo.tabla.tieneDeletedAt) expect(consulta.text).toContain(`${tipo.tabla.alias}.deleted_at IS NULL`);
      }
    }
  });

  it('lo que escribe el usuario va como parámetro, nunca dentro del SQL', () => {
    const ataque = "x'; DROP TABLE clientes; --";
    const r = compilar('ventas', { columnas: ['cliente'], filtros: { campos: [{ columna: 'cliente', operador: 'contiene', valor: ataque }] } });
    const consulta = r.filas!(1, 50);
    expect(consulta.text).not.toContain('DROP TABLE');
    expect(consulta.values).toContain(`%${ataque}%`);
  });

  it('en "contiene", % y _ se buscan literalmente', () => {
    const r = compilar('ventas', { columnas: ['detalle'], filtros: { campos: [{ columna: 'detalle', operador: 'contiene', valor: '50%_off' }] } });
    expect(r.resumen.values).toContain('%50\\%\\_off%');
  });

  it('quien está limitado a una sucursal solo ve la suya (o las filas sin sucursal si la columna lo permite)', () => {
    const ventas = compilar('ventas', { columnas: ['monto'] }, contexto({ sucursalAlcance: SUCURSAL }));
    expect(ventas.resumen.text).toMatch(/t\.sucursal_id = \$\d+::uuid/);
    expect(ventas.resumen.values).toContain(SUCURSAL);
    const membresias = compilar('membresias', { columnas: ['monto'] }, contexto({ sucursalAlcance: SUCURSAL }));
    expect(membresias.resumen.text).toMatch(/\(m\.sucursal_id = \$\d+::uuid OR m\.sucursal_id IS NULL\)/);
  });

  it('"solo míos" filtra por quien lo registró', () => {
    const r = compilar('ventas', { columnas: ['monto'], filtros: { soloMios: true } });
    expect(r.resumen.text).toMatch(/t\.creado_por_id = \$\d+::uuid/);
    expect(r.resumen.values).toContain(USUARIO);
  });

  it('"este mes" usa el mes del gimnasio: desde las 00:00 del 1 de septiembre en La Paz (04:00 UTC)', () => {
    const r = compilar('ventas', { columnas: ['monto'], filtros: { fecha: { rango: 'este_mes' } } });
    const instantes = r.resumen.values.filter((v): v is Date => v instanceof Date).map((d) => d.toISOString());
    expect(instantes).toEqual(['2026-09-01T04:00:00.000Z', '2026-10-01T04:00:00.000Z']);
  });

  it('en columnas de fecha (sin hora) compara fechas, no instantes', () => {
    const r = compilar('membresias', { columnas: ['fechaFin'], filtros: { fecha: { columna: 'fechaFin', rango: 'proximos_7' } } });
    expect(r.resumen.text).toMatch(/m\.fecha_fin >= \$\d+::date AND m\.fecha_fin < \$\d+::date/);
    expect(r.resumen.values).toEqual(expect.arrayContaining(['2026-09-30', '2026-10-07']));
  });

  it('solo une las tablas que hacen falta, con sus dependencias', () => {
    const solo = compilar('ventas', { columnas: ['monto'] }).resumen.text;
    expect(solo).not.toContain('JOIN clientes');
    expect(solo).toContain('JOIN transacciones t'); // obligatoria
    const conPlan = compilar('ventas', { columnas: ['plan'] }).resumen.text;
    expect(conPlan).toContain('LEFT JOIN membresias m');
    expect(conPlan.indexOf('JOIN membresias m')).toBeLessThan(conPlan.indexOf('JOIN planes pl'));
  });

  it('agrupado: un conjunto por nivel más el total general, y por mes en la hora del gimnasio', () => {
    const r = compilar('ventas', {
      formato: 'AGRUPADO',
      columnas: ['monto'],
      agrupaciones: [{ columna: 'sucursal' }, { columna: 'fecha', granularidad: 'mes' }],
      totales: [{ columna: 'monto', funcion: 'suma' }],
    });
    expect(r.resumen.text).toContain('GROUPING SETS ((g0, g1), (g0), ())');
    expect(r.resumen.text).toMatch(/date_trunc\('month', \(t\.fecha_hora AT TIME ZONE \$\d+\)\)::date AS g1/);
    expect(r.resumen.text).toContain('sum(t0) AS a0');
  });

  it('agrupado sin detalle no trae filas', () => {
    const r = compilar('asistencias', { formato: 'AGRUPADO', columnas: [], agrupaciones: [{ columna: 'sucursal' }], mostrarDetalle: false });
    expect(r.filas).toBeNull();
  });
});

describe('validación de la definición', () => {
  const ventas = tipoReporte('ventas')!;
  const invalida = (d: Record<string, unknown>) => () => validarDefinicion({ tipo: 'ventas', ...d }, ventas);

  it('rechaza columnas, operadores y valores que no son del catálogo', () => {
    expect(invalida({ columnas: ['contrasena_hash'] })).toThrow('no existe');
    expect(invalida({ columnas: ['monto'], filtros: { campos: [{ columna: 'monto', operador: 'contiene', valor: '1' }] } })).toThrow('no sirve');
    expect(invalida({ columnas: ['monto'], filtros: { campos: [{ columna: 'monto', operador: 'mayor', valor: 'mucho' }] } })).toThrow('número');
    expect(invalida({ columnas: ['concepto'], filtros: { campos: [{ columna: 'concepto', operador: 'en', valores: ['HACK'] }] } })).toThrow('no es un valor');
    expect(invalida({ columnas: ['cliente'], totales: [{ columna: 'cliente', funcion: 'suma' }] })).toThrow('no se puede sumar');
  });

  it('agrupar exige el formato agrupado, y el agrupado exige un grupo', () => {
    expect(invalida({ columnas: ['monto'], agrupaciones: [{ columna: 'sucursal' }] })).toThrow('Agrupado');
    expect(invalida({ formato: 'AGRUPADO', columnas: ['monto'] })).toThrow('agrupar');
  });

  it('completa lo que falta con valores por defecto', () => {
    const d = validarDefinicion({ tipo: 'ventas' }, ventas);
    expect(d.columnas).toEqual(ventas.columnasIniciales);
    expect(d.filtros.fecha).toEqual({ columna: 'fecha', rango: 'todo', desde: undefined, hasta: undefined });
  });
});

describe('rangos de fecha relativos', () => {
  const miercoles = new Date('2026-09-30T00:00:00Z');
  it('la semana empieza el lunes', () => {
    expect(rangoDeFechas('esta_semana', miercoles)).toEqual({ desde: '2026-09-28', hasta: '2026-10-05' });
    expect(rangoDeFechas('semana_pasada', miercoles)).toEqual({ desde: '2026-09-21', hasta: '2026-09-28' });
  });
  it('meses, años y últimos días', () => {
    expect(rangoDeFechas('mes_pasado', miercoles)).toEqual({ desde: '2026-08-01', hasta: '2026-09-01' });
    expect(rangoDeFechas('anio_pasado', miercoles)).toEqual({ desde: '2025-01-01', hasta: '2026-01-01' });
    expect(rangoDeFechas('ultimos_7', miercoles)).toEqual({ desde: '2026-09-24', hasta: '2026-10-01' });
  });
  it('en el personalizado, "hasta" incluye ese día', () => {
    expect(rangoDeFechas('personalizado', miercoles, { desde: '2026-09-01', hasta: '2026-09-15' })).toEqual({ desde: '2026-09-01', hasta: '2026-09-16' });
  });
});
