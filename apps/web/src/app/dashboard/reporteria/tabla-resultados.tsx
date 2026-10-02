"use client";

import { Fragment, ReactNode } from 'react';
import { formatearValor, Granularidad, Resultado, Resumen } from './tipos';

// Al agrupar una fecha por periodo, el encabezado nombra el periodo.
const NOMBRE_PERIODO: Record<Granularidad, string> = { dia: 'Día', semana: 'Semana', mes: 'Mes', anio: 'Año' };

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function Totales({ resumen, resultado, grande = false }: { resumen: Resumen; resultado: Resultado; grande?: boolean }) {
  return (
    <span className={`flex flex-wrap items-baseline gap-x-4 gap-y-0.5 ${grande ? 'text-sm' : 'text-xs'}`}>
      <span className="text-slate-500 dark:text-slate-400">
        {resumen.cantidad.toLocaleString('es-ES')} {resumen.cantidad === 1 ? 'registro' : 'registros'}
      </span>
      {resultado.totales.map((t, i) => (
        <span key={`${t.clave}-${t.funcion}`} className="text-slate-600 dark:text-slate-300">
          {t.nombre}: <strong className="text-slate-900 dark:text-white">{formatearValor(resumen.totales[i], t.tipo)}</strong>
        </span>
      ))}
    </span>
  );
}

/**
 * Resultado de un reporte (docs/plan-reporteria.md, fases 4 y 5). Lista: las
 * filas y el total general. Agrupado: cada grupo con su subtotal y, debajo,
 * sus filas de detalle (las de la página actual).
 */
export function TablaResultados({ resultado, vacio }: { resultado: Resultado; vacio?: ReactNode }) {
  const { columnas, agrupaciones, filas, resumenes } = resultado;
  const general = resumenes.find((r) => r.nivel === 0);
  const niveles = agrupaciones.length;
  const ancho = Math.max(columnas.length, 1);

  const celdas = (fila: Record<string, unknown>) =>
    columnas.map((c) => (
      <td
        key={c.clave}
        className={`whitespace-nowrap px-3 py-1.5 ${c.tipo === 'moneda' || c.tipo === 'numero' ? 'text-right tabular-nums' : ''} text-slate-700 dark:text-slate-200`}
      >
        {formatearValor(fila[c.clave], c.tipo, c.opciones)}
      </td>
    ));

  // Encabezados de grupo anidados; al llegar al último nivel, sus filas de detalle.
  const nivel = (n: number, prefijo: unknown[]): ReactNode =>
    resumenes
      .filter((r) => r.nivel === n && prefijo.every((v, i) => igual(r.grupo[i], v)))
      .map((r) => {
        const g = agrupaciones[n - 1];
        const valor = r.grupo[n - 1];
        const clave = JSON.stringify(r.grupo);
        const detalle =
          n === niveles && filas ? filas.filter((f) => r.grupo.every((v, i) => igual(f[`g${i}`], v))) : [];
        return (
          <Fragment key={clave}>
            <tr className={n === 1 ? 'bg-slate-100 dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-800/50'}>
              <td colSpan={ancho} className="px-3 py-2" style={{ paddingLeft: `${0.75 + (n - 1) * 1.25}rem` }}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    <span className="font-normal text-slate-500 dark:text-slate-400">{g.granularidad ? NOMBRE_PERIODO[g.granularidad] : g.nombre}: </span>
                    {valor === null || valor === undefined || valor === '' ? (
                      <span className="font-normal italic text-slate-500 dark:text-slate-400">(sin dato)</span>
                    ) : (
                      formatearValor(valor, g.tipo, g.opciones, g.granularidad)
                    )}
                  </span>
                  <Totales resumen={r} resultado={resultado} />
                </div>
              </td>
            </tr>
            {n < niveles ? nivel(n + 1, r.grupo) : detalle.map((f, i) => <tr key={i} className="border-b border-slate-100 dark:border-slate-800">{celdas(f)}</tr>)}
          </Fragment>
        );
      });

  if (!general || general.cantidad === 0) {
    return <>{vacio ?? <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">No hay datos con estos filtros.</p>}</>;
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 dark:border-indigo-500/20 dark:bg-indigo-500/10">
        <Totales resumen={general} resultado={resultado} grande />
      </div>
      {(filas || niveles > 0) && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            {columnas.length > 0 && filas && (
              <thead className="bg-white dark:bg-slate-900">
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  {columnas.map((c) => (
                    <th
                      key={c.clave}
                      className={`whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 ${
                        c.tipo === 'moneda' || c.tipo === 'numero' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {c.nombre}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody className="bg-white dark:bg-slate-900">
              {niveles > 0 ? nivel(1, []) : filas!.map((f, i) => <tr key={i} className="border-b border-slate-100 dark:border-slate-800">{celdas(f)}</tr>)}
            </tbody>
          </table>
        </div>
      )}
      {resultado.gruposRecortados && (
        <p className="text-xs text-amber-700 dark:text-amber-400">Hay demasiados grupos para mostrarlos todos: agrupa por algo más general o filtra.</p>
      )}
    </div>
  );
}
