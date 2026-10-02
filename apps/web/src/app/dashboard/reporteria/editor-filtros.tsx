"use client";

import { useSucursalActiva } from '@/hooks/use-sucursal-activa';
import { Plus, X } from 'lucide-react';
import { Catalogo, Definicion, FiltroCampo, NOMBRE_OPERADOR, NOMBRE_RANGO, Operador, RangoFecha, SIN_VALOR, TipoCatalogo } from './tipos';

export const claseCampo =
  'h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

interface Props {
  tipo: TipoCatalogo;
  catalogo: Catalogo;
  definicion: Definicion;
  cambiar: (d: Definicion) => void;
}

// Rangos para los filtros "con / sin" (sin el personalizado).
const RANGOS_CRUZADO: RangoFecha[] = ['todo', 'ultimos_7', 'ultimos_30', 'ultimos_90', 'este_mes', 'mes_pasado', 'este_anio', 'proximos_7', 'proximos_30'];

/** Filtros rápidos (fecha, sucursal, solo míos) y filtros por columna. */
export function EditorFiltros({ tipo, catalogo, definicion, cambiar }: Props) {
  const { sucursales, esFija } = useSucursalActiva();
  const f = definicion.filtros;
  const set = (filtros: Partial<Definicion['filtros']>) => cambiar({ ...definicion, filtros: { ...f, ...filtros } });
  const columnasFecha = tipo.columnas.filter((c) => c.tipo === 'fecha' || c.tipo === 'fechaHora');
  const col = (clave: string) => tipo.columnas.find((c) => c.clave === clave)!;

  const setCampo = (i: number, campo: FiltroCampo) => set({ campos: f.campos.map((x, j) => (j === i ? campo : x)) });
  const nuevoFiltro = (clave: string): FiltroCampo => {
    const c = col(clave);
    const operador = catalogo.operadores[c.tipo][0];
    return { columna: clave, operador, ...(operador === 'en' ? { valores: [] } : {}) };
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Fechas</h4>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={claseCampo}
            value={f.fecha.columna}
            onChange={(e) => set({ fecha: { ...f.fecha, columna: e.target.value } })}
            aria-label="Columna de fecha"
          >
            {columnasFecha.map((c) => (
              <option key={c.clave} value={c.clave}>
                {c.nombre}
              </option>
            ))}
          </select>
          <select
            className={claseCampo}
            value={f.fecha.rango}
            onChange={(e) => set({ fecha: { columna: f.fecha.columna, rango: e.target.value as RangoFecha } })}
            aria-label="Rango de fechas"
          >
            {(Object.keys(NOMBRE_RANGO) as RangoFecha[]).map((r) => (
              <option key={r} value={r}>
                {NOMBRE_RANGO[r]}
              </option>
            ))}
          </select>
          {f.fecha.rango === 'personalizado' && (
            <>
              <input type="date" className={claseCampo} value={f.fecha.desde ?? ''} onChange={(e) => set({ fecha: { ...f.fecha, desde: e.target.value || undefined } })} aria-label="Desde" />
              <span className="text-sm text-slate-500">al</span>
              <input type="date" className={claseCampo} value={f.fecha.hasta ?? ''} onChange={(e) => set({ fecha: { ...f.fecha, hasta: e.target.value || undefined } })} aria-label="Hasta" />
            </>
          )}
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-4">
        {!esFija && sucursales.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            Sucursal
            <select className={claseCampo} value={f.sucursalId ?? ''} onChange={(e) => set({ sucursalId: e.target.value || undefined })}>
              <option value="">Todas</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        {tipo.tieneSoloMios && (
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={f.soloMios} onChange={(e) => set({ soloMios: e.target.checked })} />
            Solo los que registré yo
          </label>
        )}
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Filtros por columna</h4>
        {f.campos.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Sin filtros: se incluyen todas las filas del rango de fechas.</p>}
        {f.campos.map((filtro, i) => {
          const c = col(filtro.columna);
          const numerico = c.tipo === 'numero' || c.tipo === 'moneda';
          const esFecha = c.tipo === 'fecha' || c.tipo === 'fechaHora';
          const tipoInput = numerico ? 'number' : esFecha ? 'date' : 'text';
          return (
            <div key={i} className="flex flex-wrap items-start gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
              <span className="mt-2 w-5 text-xs font-semibold text-slate-400">{i + 1}</span>
              <select className={claseCampo} value={filtro.columna} onChange={(e) => setCampo(i, nuevoFiltro(e.target.value))} aria-label={`Columna del filtro ${i + 1}`}>
                {tipo.columnas.map((x) => (
                  <option key={x.clave} value={x.clave}>
                    {x.nombre}
                  </option>
                ))}
              </select>
              <select
                className={claseCampo}
                value={filtro.operador}
                onChange={(e) => {
                  const operador = e.target.value as Operador;
                  setCampo(i, { columna: filtro.columna, operador, ...(operador === 'en' || operador === 'no_en' ? { valores: filtro.valores ?? [] } : {}) });
                }}
                aria-label={`Condición del filtro ${i + 1}`}
              >
                {catalogo.operadores[c.tipo].map((o) => (
                  <option key={o} value={o}>
                    {NOMBRE_OPERADOR[o]}
                  </option>
                ))}
              </select>
              {filtro.operador === 'en' || filtro.operador === 'no_en' ? (
                <div className="flex max-w-md flex-wrap gap-x-3 gap-y-1 pt-2">
                  {Object.entries(c.opciones ?? {}).map(([valor, nombre]) => (
                    <label key={valor} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-indigo-600"
                        checked={filtro.valores?.includes(valor) ?? false}
                        onChange={(e) =>
                          setCampo(i, {
                            ...filtro,
                            valores: e.target.checked ? [...(filtro.valores ?? []), valor] : (filtro.valores ?? []).filter((v) => v !== valor),
                          })
                        }
                      />
                      {nombre}
                    </label>
                  ))}
                </div>
              ) : SIN_VALOR.includes(filtro.operador) ? null : (
                <>
                  <input
                    type={tipoInput}
                    className={`${claseCampo} w-44`}
                    value={filtro.valor ?? ''}
                    placeholder={numerico ? '0' : 'Escribe…'}
                    onChange={(e) => setCampo(i, { ...filtro, valor: e.target.value })}
                    aria-label={`Valor del filtro ${i + 1}`}
                  />
                  {filtro.operador === 'entre' && (
                    <>
                      <span className="mt-2 text-sm text-slate-500">y</span>
                      <input
                        type={tipoInput}
                        className={`${claseCampo} w-44`}
                        value={filtro.valorHasta ?? ''}
                        onChange={(e) => setCampo(i, { ...filtro, valorHasta: e.target.value })}
                        aria-label={`Hasta, filtro ${i + 1}`}
                      />
                    </>
                  )}
                </>
              )}
              <button
                type="button"
                // Al quitar un filtro cambian los números: la lógica se vuelve a escribir.
                onClick={() => set({ campos: f.campos.filter((_, j) => j !== i), logica: undefined })}
                className="ml-auto mt-1 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                aria-label={`Quitar filtro ${i + 1}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {f.campos.length < 20 && (
          <button
            type="button"
            onClick={() => set({ campos: [...f.campos, nuevoFiltro(definicion.columnas[0] ?? tipo.columnas[0].clave)] })}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            <Plus className="h-4 w-4" /> Agregar filtro
          </button>
        )}
        {f.campos.length > 1 &&
          (catalogo.avanzado ? (
            <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              Cómo se combinan
              <input
                className={`${claseCampo} w-56`}
                value={f.logica ?? ''}
                placeholder={f.campos.map((_, i) => i + 1).join(' Y ')}
                onChange={(e) => set({ logica: e.target.value || undefined })}
                aria-label="Lógica de filtros"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">Con números, Y, O, NO y paréntesis: por ejemplo, 1 Y (2 O 3). Vacío: todos a la vez.</span>
            </label>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">Se cumplen todos los filtros a la vez.</p>
          ))}
      </section>

      {catalogo.avanzado && tipo.cruzados.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Con / sin</h4>
          {(f.cruzados ?? []).map((x, i) => {
            const c = tipo.cruzados.find((y) => y.clave === x.clave)!;
            const setCruzado = (nuevo: typeof x) => set({ cruzados: (f.cruzados ?? []).map((y, j) => (j === i ? nuevo : y)) });
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select className={claseCampo} value={x.modo} onChange={(e) => setCruzado({ ...x, modo: e.target.value as 'con' | 'sin' })} aria-label={`Con o sin, filtro ${i + 1}`}>
                  <option value="con">Con</option>
                  <option value="sin">Sin</option>
                </select>
                <select
                  className={claseCampo}
                  value={x.clave}
                  onChange={(e) => setCruzado({ clave: e.target.value, modo: x.modo })}
                  aria-label={`Qué, filtro con/sin ${i + 1}`}
                >
                  {tipo.cruzados.map((y) => (
                    <option key={y.clave} value={y.clave}>
                      {y.nombre}
                    </option>
                  ))}
                </select>
                {c.conRango && (
                  <select
                    className={claseCampo}
                    value={x.rango ?? 'todo'}
                    onChange={(e) => setCruzado({ ...x, rango: e.target.value === 'todo' ? undefined : (e.target.value as RangoFecha) })}
                    aria-label={`Cuándo, filtro con/sin ${i + 1}`}
                  >
                    {RANGOS_CRUZADO.map((r) => (
                      <option key={r} value={r}>
                        {r === 'todo' ? 'alguna vez' : NOMBRE_RANGO[r].toLowerCase()}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => set({ cruzados: (f.cruzados ?? []).filter((_, j) => j !== i) })}
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                  aria-label={`Quitar el filtro con/sin ${i + 1}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
          {(f.cruzados ?? []).length < 3 && (
            <button
              type="button"
              onClick={() => set({ cruzados: [...(f.cruzados ?? []), { clave: tipo.cruzados[0].clave, modo: 'sin' }] })}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              <Plus className="h-4 w-4" /> Agregar "con / sin"
            </button>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">Por ejemplo: clientes con membresía activa y sin asistencias en los últimos 30 días.</p>
        </section>
      )}
    </div>
  );
}
