import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import type { Page } from '@playwright/test';
import { expect, sesion, test } from './base';

// Recorrido 7 (docs/plan-pruebas-e2e.md): una plantilla de la reportería con
// datos (la venta del seed es de este mes), exportada a CSV y Excel con los
// mismos totales que la pantalla. Recepción la ve y la exporta, pero no arma.

const PLANTILLA = 'Ventas de este mes por plan';

/** "Bs. 1.234,50" → 1234.5 (formato de la web y del CSV). */
const numero = (texto: string) => Number(texto.replace(/Bs\.?\s*/, '').replace(/\./g, '').replace(',', '.').trim());

async function abrirPlantilla(page: Page) {
  await page.goto('/dashboard/reporteria');
  await page.getByRole('tab', { name: 'Plantillas' }).click();
  await page.getByRole('link', { name: PLANTILLA }).click();
  await expect(page.getByRole('heading', { name: PLANTILLA })).toBeVisible();
}

/** Los totales de arriba de la vista: cantidad de registros y la suma del monto. */
async function totalesEnPantalla(page: Page) {
  const caja = page.getByText(/registros?$/).first().locator('..');
  await expect(caja).toContainText('Suma de Monto');
  const registros = Number((await page.getByText(/^\d+ registros?$/).first().textContent())!.split(' ')[0].replace(/\./g, ''));
  const monto = numero((await caja.locator('strong').first().textContent())!);
  return { registros, monto };
}

async function descargar(page: Page, boton: 'CSV' | 'Excel') {
  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: boton, exact: true }).click();
  const archivo = await descarga;
  return { nombre: archivo.suggestedFilename(), ruta: await archivo.path() };
}

test.describe('dueño', () => {
  test.use({ storageState: sesion('dueno') });

  test('abre la plantilla y la exporta a CSV y Excel con los mismos totales', async ({ page }) => {
    await abrirPlantilla(page);
    const pantalla = await totalesEnPantalla(page);
    expect(pantalla.registros).toBeGreaterThan(0);
    expect(pantalla.monto).toBeGreaterThan(0);

    // CSV: separado por ";", con la fila "Total general" al final.
    const csv = await descargar(page, 'CSV');
    expect(csv.nombre).toMatch(/\.csv$/);
    const lineas = (await readFile(csv.ruta, 'utf-8')).replace(/^﻿/, '').trim().split(/\r?\n/).map((l) => l.split(';'));
    const encabezado = lineas[0];
    const total = lineas.find((l) => l[0] === 'Total general')!;
    expect(total, 'El CSV no tiene la fila "Total general"').toBeTruthy();
    expect(Number(total[encabezado.indexOf('Registros')])).toBe(pantalla.registros);
    expect(numero(total[encabezado.indexOf('Suma de Monto')])).toBe(pantalla.monto);

    // Excel: hoja "Resumen" con la misma fila de total.
    const xlsx = await descargar(page, 'Excel');
    expect(xlsx.nombre).toMatch(/\.xlsx$/);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.readFile(xlsx.ruta);
    const hoja = libro.getWorksheet('Resumen')!;
    let filaTitulos: ExcelJS.Row | undefined;
    let filaTotal: ExcelJS.Row | undefined;
    hoja.eachRow((fila) => {
      const primera = String(fila.getCell(1).value ?? '');
      if (fila.values && (fila.values as unknown[]).includes('Registros')) filaTitulos = fila;
      if (primera === 'Total general') filaTotal = fila;
    });
    expect(filaTitulos && filaTotal, 'El Excel no tiene encabezado o fila de total').toBeTruthy();
    const columna = (titulo: string) => (filaTitulos!.values as unknown[]).indexOf(titulo);
    expect(Number(filaTotal!.getCell(columna('Registros')).value)).toBe(pantalla.registros);
    expect(Number(filaTotal!.getCell(columna('Suma de Monto')).value)).toBe(pantalla.monto);
  });
});

test.describe('recepción', () => {
  test.use({ storageState: sesion('recepcion') });

  test('ve la plantilla y la exporta, pero no arma ni cambia reportes', async ({ page }) => {
    await page.goto('/dashboard/reporteria');
    await expect(page.getByRole('heading', { name: 'Reportería avanzada' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Nuevo reporte' })).toHaveCount(0);

    await abrirPlantilla(page);
    await expect(page.getByRole('button', { name: 'CSV', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Excel', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Duplicar' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0);
    const csv = await descargar(page, 'CSV');
    expect(csv.nombre).toMatch(/\.csv$/);

    // Si entra a "Nuevo reporte" por la dirección, se le explica.
    await page.goto('/dashboard/reporteria/nuevo');
    await expect(page.getByText('no armar reportes nuevos')).toBeVisible();
  });
});
