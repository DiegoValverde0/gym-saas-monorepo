import { describe, expect, it } from 'vitest';
import type { Resultado } from '@/app/dashboard/reporteria/tipos';
import { disenoSugerido, emparejar } from './tablero';
import { kpisDeEjemplo, resultadoDeEjemplo, valoresDelEje } from './ejemplos';

const todo = () => true;
const ids = (t: { id: string }[]) => t.map((x) => x.id);

describe('el Inicio sugerido', () => {
  it('el dueño ve primero el dinero; con clases y siendo un box, la ocupación arriba', () => {
    const musculacion = disenoSugerido({ modulos: { puntoVenta: true, controlAcceso: true }, tipoGimnasio: 'musculacion', administra: true, disponible: todo });
    expect(ids(musculacion).slice(0, 2)).toEqual(['plantilla:ingresos-anio-vs-pasado', 'plantilla:horas-pico']);
    expect(ids(musculacion)).not.toContain('plantilla:ocupacion-clases-semana');
    const box = disenoSugerido({ modulos: { puntoVenta: true, controlAcceso: true, clasesGrupales: true }, tipoGimnasio: 'box', administra: true, disponible: todo });
    expect(ids(box).slice(0, 2)).toEqual(['plantilla:ingresos-anio-vs-pasado', 'plantilla:ocupacion-clases-semana']);
    expect(ids(box).at(-1)).toBe('por-vencer');
  });

  it('recepción ve lo del día primero y nada de ingresos', () => {
    const d = disenoSugerido({ modulos: { puntoVenta: true, controlAcceso: true }, administra: false, disponible: todo });
    expect(ids(d)[0]).toBe('por-vencer');
    expect(ids(d)).not.toContain('plantilla:ingresos-anio-vs-pasado');
    expect(ids(d)).not.toContain('plantilla:ventas-mes-plan');
  });

  it('sin control de acceso no sugiere las de asistencias, y respeta lo que la persona puede ver', () => {
    const d = disenoSugerido({ modulos: { puntoVenta: true, controlAcceso: false }, administra: true, disponible: (id) => id !== 'plantilla:ventas-mes-plan' });
    expect(ids(d)).toEqual(['plantilla:ingresos-anio-vs-pasado', 'estado-clientes', 'por-vencer']);
    // El estado de los clientes quedó solo entre dos anchas: se agranda.
    expect(d[1].tamano).toBe('ancha');
  });

  it('las medianas van de a dos; la que queda suelta se agranda', () => {
    const m = (id: string) => ({ id, tamano: 'mediana' as const });
    const a = (id: string) => ({ id, tamano: 'ancha' as const });
    expect(emparejar([m('1'), m('2'), m('3'), a('4')]).map((t) => t.tamano)).toEqual(['mediana', 'mediana', 'ancha', 'ancha']);
    expect(emparejar([m('1'), m('2')]).map((t) => t.tamano)).toEqual(['mediana', 'mediana']);
    expect(emparejar([a('1'), m('2')]).map((t) => t.tamano)).toEqual(['ancha', 'ancha']);
  });
});

// Un resultado vacío como el que devuelve la API para una tarjeta.
const vacio = (r: Partial<Resultado> & Pick<Resultado, 'definicion' | 'agrupaciones'>): Resultado => ({
  columnas: [],
  totales: [],
  filas: null,
  resumenes: [],
  totalFilas: 0,
  pagina: 1,
  porPagina: 6,
  recortado: false,
  gruposRecortados: false,
  ...r,
});
const definicion = (formato: 'AGRUPADO' | 'TABLA_CRUZADA' | 'LISTA', rango: string) =>
  ({ formato, filtros: { fecha: { rango } }, grafico: { tipo: 'barras', valor: 'cantidad' } }) as unknown as Resultado['definicion'];

describe('los datos de ejemplo', () => {
  const hoy = new Date(2026, 9, 2, 15, 0); // viernes 2 de octubre de 2026, 15:00

  it('arma los ejes: últimos 30 días, meses de este año, años, días de la semana y horas', () => {
    expect(valoresDelEje({ clave: 'ingreso', nombre: '', tipo: 'fecha', granularidad: 'dia' }, 'ultimos_30', hoy)).toHaveLength(30);
    expect(valoresDelEje({ clave: 'ingreso', nombre: '', tipo: 'fecha', granularidad: 'dia' }, 'ultimos_30', hoy).at(-1)).toBe('2026-10-02');
    expect(valoresDelEje({ clave: 'alta', nombre: '', tipo: 'fecha', granularidad: 'mes' }, 'este_anio', hoy)).toEqual(
      ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].map((m) => `2026-${m}-01`),
    );
    expect(valoresDelEje({ clave: 'fecha', nombre: '', tipo: 'fecha', granularidad: 'anio' }, 'todo', hoy)).toEqual(['2024-01-01', '2025-01-01', '2026-01-01']);
    expect(valoresDelEje({ clave: 'diaSemana', nombre: '', tipo: 'lista', opciones: { '1': 'Lunes', '2': 'Martes' } }, undefined, hoy)).toEqual(['1', '2']);
    expect(valoresDelEje({ clave: 'hora', nombre: '', tipo: 'numero' }, undefined, hoy)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
  });

  it('llena un agrupado con totales que cuadran', () => {
    const r = resultadoDeEjemplo(
      vacio({
        definicion: definicion('AGRUPADO', 'este_mes'),
        agrupaciones: [{ clave: 'plan', nombre: 'Plan', tipo: 'texto' }],
        totales: [{ clave: 'monto', funcion: 'suma', nombre: 'Suma de Monto', tipo: 'moneda' }],
      }),
      hoy,
    )!;
    const filas = r.resumenes.filter((x) => x.nivel === 1);
    expect(filas.map((x) => x.grupo[0])).toEqual(['Mensual', 'Trimestral', 'Anual', 'Pase diario']);
    const total = r.resumenes.find((x) => x.nivel === 0)!;
    expect(total.totales[0]).toBe(filas.reduce((s, x) => s + Number(x.totales[0]), 0));
    expect(r.totalFilas).toBeGreaterThan(0);
  });

  it('en la comparación de años, el año actual llega hasta este mes', () => {
    const r = resultadoDeEjemplo(
      vacio({
        definicion: definicion('TABLA_CRUZADA', 'todo'),
        agrupaciones: [{ clave: 'fecha', nombre: 'Fecha', tipo: 'fecha', granularidad: 'anio' }],
        columnaCruzada: { clave: 'mesDelAnio', nombre: 'Mes', tipo: 'lista', opciones: Object.fromEntries(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m) => [m, m])) },
        totales: [{ clave: 'monto', funcion: 'suma', nombre: 'Suma de Monto', tipo: 'moneda' }],
      }),
      hoy,
    )!;
    // Los meses en orden (no "10", "11", "12" primero) y con montos de un mes.
    expect(r.resumenes.filter((x) => x.conColumna && x.nivel === 0).map((x) => x.columna)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']);
    expect(Number(r.resumenes.find((x) => x.conColumna && x.nivel === 1)!.totales[0])).toBeGreaterThan(10_000);
    const casillas = (anio: string) => r.resumenes.filter((x) => x.conColumna && x.nivel === 1 && x.grupo[0] === `${anio}-01-01`);
    expect(casillas('2025')).toHaveLength(12);
    expect(casillas('2026')).toHaveLength(10);
    expect(r.resumenes.filter((x) => x.conColumna && x.nivel === 0)).toHaveLength(12);
  });

  it('las listas no llevan ejemplo (serían personas inventadas)', () => {
    expect(resultadoDeEjemplo(vacio({ definicion: definicion('LISTA', 'todo'), agrupaciones: [] }), hoy)).toBeNull();
  });

  it('los indicadores de ejemplo no muestran ingresos a quien no los ve', () => {
    const real = {
      ingresos: null,
      asistencias: { hoy: 0, promedioMismoDia: null, serie: [] },
      clientes: { activos: 0, totales: 0, altasMes: 0, altasMesPasadoMismaAltura: 0 },
      membresiasPorVencer: 0,
      conDatos: false,
    };
    const k = kpisDeEjemplo(real, hoy);
    expect(k.ingresos).toBeNull();
    expect(k.asistencias.serie).toHaveLength(14);
    expect(k.clientes.activos).toBeGreaterThan(0);
    const conIngresos = kpisDeEjemplo({ ...real, ingresos: { hoy: 0, ayerMismaHora: 0, mes: 0, mesPasadoMismaAltura: 0, mesPasado: 0, variacionMes: null, variacionHoy: null, proyeccionMes: null, serie: [] } }, hoy);
    expect(conIngresos.ingresos?.serie).toHaveLength(30);
    // El 2 del mes todavía no se proyecta (lo mismo que la API: desde el día 3).
    expect(conIngresos.ingresos?.proyeccionMes).toBeNull();
  });
});
