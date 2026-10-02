"use client";

import { createContext, useContext, useEffect, useState } from 'react';
import { Eye, EyeOff, Sparkles } from 'lucide-react';
import { useTenantStore } from '@/store/use-tenant-store';
import type { Kpis } from './indicadores';

// Los datos de ejemplo del Inicio (docs/plan-inicio.md, decisión I4): un
// gimnasio sin ventas ni ingresos registrados ve cómo se va a ver su Inicio.
// Cada tarjeta con números inventados dice "Ejemplo"; en cuanto hay datos
// reales se apagan solos. Ocultarlos se recuerda en este navegador.

const ContextoEjemplo = createContext(false);
export const ConEjemplos = ContextoEjemplo.Provider;
/** Si el Inicio está mostrando ejemplos (las tarjetas sin datos se llenan). */
export const useEsEjemplo = () => useContext(ContextoEjemplo);

export function useEjemplos(kpis: Kpis | undefined) {
  const { activeTenantId } = useTenantStore();
  const clave = `inicio-ejemplos-ocultos:${activeTenantId ?? ''}`;
  const [ocultos, setOcultos] = useState(false);
  useEffect(() => {
    try {
      setOcultos(localStorage.getItem(clave) === '1');
    } catch {
      // Sin almacenamiento (ventana privada): se muestran.
    }
  }, [clave]);
  const cambiar = (valor: boolean) => {
    setOcultos(valor);
    try {
      if (valor) localStorage.setItem(clave, '1');
      else localStorage.removeItem(clave);
    } catch {
      // Igual cambia en esta visita.
    }
  };
  const sinDatos = !!kpis && !kpis.conDatos;
  return { sinDatos, activos: sinDatos && !ocultos, ocultar: () => cambiar(true), mostrar: () => cambiar(false) };
}

/** La marca de cada tarjeta con números de ejemplo. */
export function MarcaEjemplo() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-dashed border-indigo-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:border-indigo-500/50 dark:text-indigo-300">
      Ejemplo
    </span>
  );
}

export function AvisoEjemplos({ sinDatos, activos, ocultar, mostrar }: ReturnType<typeof useEjemplos>) {
  if (!sinDatos) return null;
  if (!activos) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        Tu gimnasio todavía no tiene ventas ni ingresos registrados.
        <button type="button" onClick={mostrar} className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          <Eye className="h-4 w-4" aria-hidden /> Ver con datos de ejemplo
        </button>
      </p>
    );
  }
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/60 p-4 dark:border-indigo-500/40 dark:bg-indigo-500/10">
      <Sparkles className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">Así se va a ver tu Inicio</p>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Son datos de ejemplo: cada tarjeta que los usa dice <strong>Ejemplo</strong>. Se cambian solos por los tuyos cuando registres ventas e ingresos.
        </p>
      </div>
      <button
        type="button"
        onClick={ocultar}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <EyeOff className="h-4 w-4" aria-hidden /> Ocultar los ejemplos
      </button>
    </div>
  );
}
