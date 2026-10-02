import { describe, expect, it } from 'vitest';
import * as ExcelJS from 'exceljs';
import { aCsv, aExcel, DatosExportacion, nombreArchivo } from './exportador';

const base: DatosExportacion = {
  titulo: 'Ventas por plan',
  tipoNombre: 'Ventas',
  filtros: 'Últimos 30 días',
  zonaHoraria: 'America/La_Paz',
  generado: new Date('2026-10-01T14:00:00Z'),
  grupos: [{ clave: 'plan', nombre: 'Plan', tipo: 'texto' }],
  columnas: [
    { clave: 'fecha', nombre: 'Fecha y hora', tipo: 'fechaHora' },
    { clave: 'cliente', nombre: 'Cliente', tipo: 'texto' },
    { clave: 'concepto', nombre: 'Qué se vendió', tipo: 'lista', opciones: { MEMBRESIA: 'Membresía' } },
    { clave: 'monto', nombre: 'Monto', tipo: 'moneda' },
  ],
  totales: [{ nombre: 'Suma de Monto', tipo: 'moneda' }],
  filas: [
    // 16:05 UTC = 12:05 en La Paz.
    { g0: 'Mensual', fecha: '2026-09-28T16:05:00.000Z', cliente: 'Pérez; Juan "JP"', concepto: 'MEMBRESIA', monto: 300.5 },
    { g0: null, fecha: '2026-09-29T13:00:00.000Z', cliente: 'Ana', concepto: 'MEMBRESIA', monto: 5 },
  ],
  resumenes: [
    { nivel: 1, grupo: ['Mensual'], cantidad: 1, totales: [300.5] },
    { nivel: 1, grupo: [null], cantidad: 1, totales: [5] },
    { nivel: 0, grupo: [], cantidad: 2, totales: [305.5] },
  ],
};

describe('exportar a CSV', () => {
  const csv = aCsv(base).toString('utf-8');

  it('para Excel en español: BOM, ";" y coma decimal', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [titulos, primera] = csv.slice(1).split('\r\n');
    expect(titulos).toBe('Plan;Fecha y hora;Cliente;Qué se vendió;Monto');
    // Hora del gimnasio, texto entre comillas si tiene ";" o comillas, y nombres legibles.
    expect(primera).toBe('Mensual;28/09/2026 12:05;"Pérez; Juan ""JP""";Membresía;300,50');
  });

  it('sin detalle exporta los subtotales y el total general', () => {
    const resumen = aCsv({ ...base, filas: null }).toString('utf-8').slice(1).split('\r\n');
    expect(resumen[0]).toBe('Plan;Registros;Suma de Monto');
    expect(resumen[1]).toBe('Mensual;1;300,50');
    expect(resumen[2]).toBe('(sin dato);1;5,00');
    expect(resumen[3]).toBe('Total general;2;305,50');
  });
});

describe('exportar a Excel', () => {
  it('hojas Datos y Resumen, con números y fechas de verdad', async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await aExcel(base));
    expect(libro.worksheets.map((h) => h.name)).toEqual(['Datos', 'Resumen']);

    const datos = libro.getWorksheet('Datos')!;
    expect(datos.getCell('A1').value).toBe('Ventas por plan');
    expect(String(datos.getCell('A2').value)).toContain('Ventas · Últimos 30 días · Generado el 01/10/2026 a las 10:00');
    expect(datos.getRow(4).values).toEqual([undefined, 'Plan', 'Fecha y hora', 'Cliente', 'Qué se vendió', 'Monto']);
    const monto = datos.getCell('E5');
    expect(monto.value).toBe(300.5);
    expect(monto.numFmt).toBe('#,##0.00');
    // La fecha y hora se guarda como la ve el gimnasio (12:05), no en UTC.
    expect((datos.getCell('B5').value as Date).toISOString()).toBe('2026-09-28T12:05:00.000Z');
    expect(datos.getCell('D5').value).toBe('Membresía');

    const resumen = libro.getWorksheet('Resumen')!;
    expect(resumen.getRow(4).values).toEqual([undefined, 'Plan', 'Registros', 'Suma de Monto']);
    expect(resumen.getRow(7).values).toEqual([undefined, 'Total general', 2, 305.5]);
  });
});

describe('nombre del archivo', () => {
  it('sin acentos ni símbolos', () => {
    expect(nombreArchivo('Ventas por plan (90 días)', new Date('2026-10-01T12:00:00Z'), 'xlsx', 'America/La_Paz')).toBe('ventas-por-plan-90-dias-2026-10-01.xlsx');
  });

  it('con la fecha del gimnasio: a las 22:30 de La Paz en UTC ya es el día siguiente', () => {
    expect(nombreArchivo('Ventas', new Date('2026-10-02T02:30:00Z'), 'csv', 'America/La_Paz')).toBe('ventas-2026-10-01.csv');
  });
});
