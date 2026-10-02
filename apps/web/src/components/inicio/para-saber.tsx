"use client";

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Lightbulb, TrendingUp } from 'lucide-react';
import { apiGet } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { useTenantStore } from '@/store/use-tenant-store';

// "Lo que hay que saber hoy" (docs/plan-inicio.md, sección 4 y fase 4): las
// frases que arma la API con reglas claras, cada una con su botón.

interface Frase {
  clave: string;
  tono: 'bueno' | 'atencion' | 'info';
  texto: string;
  detalle?: string;
  accion?: { texto: string; href: string };
}

// El ícono dice el tono, no solo el color.
const TONO = {
  atencion: { icono: AlertTriangle, clase: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', nombre: 'Atención' },
  bueno: { icono: TrendingUp, clase: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400', nombre: 'Buena noticia' },
  info: { icono: Lightbulb, clase: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300', nombre: 'Dato' },
};

export function ParaSaber() {
  const { token } = useAuth();
  const { activeTenantId } = useTenantStore();
  const { data } = useQuery({
    queryKey: ['dashboard-para-saber', activeTenantId],
    queryFn: () => apiGet<{ frases: Frase[] }>('/dashboard/para-saber'),
    enabled: !!token,
    meta: { silencioso: true },
  });
  const frases = data?.frases ?? [];
  if (frases.length === 0) return null;

  return (
    <section aria-labelledby="para-saber-titulo" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <h3 id="para-saber-titulo" className="mb-3 text-base font-semibold text-slate-900 dark:text-white">
        Lo que hay que saber hoy
      </h3>
      <ul className="grid gap-3 md:grid-cols-2">
        {frases.map((f) => {
          const tono = TONO[f.tono];
          const Icono = tono.icono;
          return (
            <li key={f.clave} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tono.clase}`} title={tono.nombre}>
                <Icono className="h-4 w-4" aria-hidden />
                <span className="sr-only">{tono.nombre}:</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{f.texto}</p>
                {f.detalle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{f.detalle}</p>}
                {f.accion && (
                  <Link href={f.accion.href} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
                    {f.accion.texto} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
