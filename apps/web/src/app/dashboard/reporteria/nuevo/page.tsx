"use client";

import { useState } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useCatalogo } from '../datos';
import { Constructor } from '../constructor';
import { definicionInicial, TipoCatalogo } from '../tipos';

/** Nuevo reporte: primero "¿Qué quieres ver?", después el constructor. */
export default function NuevoReportePage() {
  const { data: catalogo, isLoading } = useCatalogo();
  const [tipo, setTipo] = useState<TipoCatalogo | null>(null);

  if (isLoading || !catalogo) return <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />;

  if (catalogo.modo === 'simple') {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-10 text-center">
        <p className="text-slate-600 dark:text-slate-300">En modo simple se usan los reportes listos. Para armar los tuyos, cambia a modo intermedio en Configuración.</p>
        <Link href="/dashboard/reporteria" className={buttonVariants({ variant: 'outline' })}>
          Volver a la reportería
        </Link>
      </div>
    );
  }

  if (tipo) return <Constructor catalogo={catalogo} tipo={tipo} inicial={definicionInicial(tipo)} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/reporteria" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">¿Qué quieres ver?</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Elige de qué es el reporte. Después eliges columnas, filtros y cómo agrupar.</p>
        </div>
      </div>
      {catalogo.tipos.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No tienes acceso a ningún tipo de reporte.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {catalogo.tipos.map((t) => (
            <button
              key={t.clave}
              type="button"
              onClick={() => setTipo(t)}
              className="group rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-400 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500"
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-900 dark:text-white">{t.nombre}</p>
                <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-500" />
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t.descripcion}</p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t.fila}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
