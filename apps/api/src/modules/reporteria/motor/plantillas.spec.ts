import { describe, expect, it } from 'vitest';
import { desdeHoraLocal } from '../../../common/utils/zona-horaria.util';
import { tipoReporte } from '../catalogo';
import { PLANTILLAS } from '../catalogo/plantillas';
import { compilarReporte } from './compilador';
import { validarDefinicion } from './definicion';
import { idDePlantilla, plantillasListas } from './plantillas';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTRA = '44444444-4444-4444-8444-444444444444';
const LA_PAZ = 'America/La_Paz';
const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('plantillas del sistema', () => {
  it('son las 12 (8 de la reportería y 4 del Inicio), con claves únicas, y todas se validan y se compilan', () => {
    expect(PLANTILLAS).toHaveLength(12);
    expect(new Set(PLANTILLAS.map((p) => p.clave)).size).toBe(12);
    for (const p of plantillasListas()) {
      const r = compilarReporte(tipoReporte(p.definicion.tipo)!, p.definicion, {
        organizacionId: ORG,
        usuarioId: '22222222-2222-4222-8222-222222222222',
        zonaHoraria: LA_PAZ,
        hoy: new Date('2026-09-30T00:00:00Z'),
        inicioDelDia: (fecha) => desdeHoraLocal(new Date(`${fecha}T00:00:00Z`), 0, LA_PAZ),
      });
      expect(r.resumen.values).toContain(ORG);
    }
  });

  it('el gráfico de cada plantilla sobrevive a la validación tal como se escribió', () => {
    for (const p of PLANTILLAS) {
      const lista = plantillasListas().find((x) => x.clave === p.clave)!;
      expect(lista.definicion.grafico).toEqual(p.definicion.grafico);
    }
  });

  it('el id es un UUID fijo por gimnasio y plantilla', () => {
    const id = idDePlantilla(ORG, 'ventas-mes-plan');
    expect(id).toMatch(UUID_V5);
    expect(idDePlantilla(ORG, 'ventas-mes-plan')).toBe(id);
    expect(idDePlantilla(OTRA, 'ventas-mes-plan')).not.toBe(id);
    expect(idDePlantilla(ORG, 'atrasos-equipo-mes')).not.toBe(id);
  });
});

describe('gráfico del reporte', () => {
  const ventas = tipoReporte('ventas')!;
  const base = { tipo: 'ventas', formato: 'AGRUPADO', agrupaciones: [{ columna: 'sucursal' }], totales: [{ columna: 'monto', funcion: 'suma' }] };
  const validar = (extra: Record<string, unknown>) => validarDefinicion({ ...base, ...extra }, ventas);

  it('en una lista no hay gráfico', () => {
    const d = validarDefinicion({ tipo: 'ventas', formato: 'LISTA', grafico: { tipo: 'barras', valor: 'cantidad' } }, ventas);
    expect(d.grafico).toBeUndefined();
  });

  it('un total que ya no está en el reporte vuelve a la cantidad', () => {
    expect(validar({ grafico: { tipo: 'barras', valor: 'suma:monto' } }).grafico).toEqual({ tipo: 'barras', valor: 'suma:monto' });
    expect(validar({ grafico: { tipo: 'lineas', valor: 'suma:precio' } }).grafico).toEqual({ tipo: 'lineas', valor: 'cantidad' });
  });

  it('rechaza un tipo de gráfico que no existe y la torta de un promedio', () => {
    expect(() => validar({ grafico: { tipo: 'radar', valor: 'cantidad' } })).toThrow(/no existe/);
    expect(() => validar({ totales: [{ columna: 'monto', funcion: 'promedio' }], grafico: { tipo: 'torta', valor: 'promedio:monto' } })).toThrow(/torta/);
  });

  it('en la tabla cruzada muestra el número de las casillas', () => {
    const d = validarDefinicion(
      {
        tipo: 'ventas',
        formato: 'TABLA_CRUZADA',
        agrupaciones: [{ columna: 'sucursal' }],
        columnaCruzada: { columna: 'fecha', granularidad: 'mes' },
        totales: [{ columna: 'monto', funcion: 'suma' }],
        grafico: { tipo: 'barras', valor: 'cantidad' },
      },
      ventas,
      { avanzado: true },
    );
    expect(d.grafico).toEqual({ tipo: 'barras', valor: 'suma:monto' });
  });

  it('mapa de calor solo en la tabla cruzada; área y barras horizontales solo en agrupado', () => {
    const cruzada = { ...base, formato: 'TABLA_CRUZADA', columnaCruzada: { columna: 'fecha', granularidad: 'mes' } };
    expect(validarDefinicion({ ...cruzada, grafico: { tipo: 'calor' } }, ventas, { avanzado: true }).grafico).toEqual({ tipo: 'calor', valor: 'suma:monto' });
    expect(() => validar({ grafico: { tipo: 'calor' } })).toThrow(/tabla cruzada/);
    expect(validar({ grafico: { tipo: 'area', valor: 'cantidad' } }).grafico).toEqual({ tipo: 'area', valor: 'cantidad' });
    expect(validar({ grafico: { tipo: 'barrasH', valor: 'suma:monto' } }).grafico).toEqual({ tipo: 'barrasH', valor: 'suma:monto' });
    expect(() => validarDefinicion({ ...cruzada, grafico: { tipo: 'area' } }, ventas, { avanzado: true })).toThrow(/agrupado/);
  });

  it('"destacar" solo en la tabla cruzada con barras o líneas', () => {
    const cruzada = { ...base, formato: 'TABLA_CRUZADA', columnaCruzada: { columna: 'mesDelAnio' } };
    expect(validarDefinicion({ ...cruzada, grafico: { tipo: 'lineas', destacar: true } }, ventas, { avanzado: true }).grafico).toEqual({ tipo: 'lineas', valor: 'suma:monto', destacar: true });
    expect(validarDefinicion({ ...cruzada, grafico: { tipo: 'calor', destacar: true } }, ventas, { avanzado: true }).grafico).toEqual({ tipo: 'calor', valor: 'suma:monto' });
    expect(validar({ grafico: { tipo: 'barras', valor: 'cantidad', destacar: true } }).grafico).toEqual({ tipo: 'barras', valor: 'cantidad' });
  });
});
