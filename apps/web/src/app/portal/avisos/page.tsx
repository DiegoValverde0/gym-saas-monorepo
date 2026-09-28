"use client";

import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api-client';
import { AlarmClock, Bell, CalendarCheck, CalendarX, CreditCard } from 'lucide-react';
import { Aviso, TipoAviso } from '../datos';

const ICONO: Record<TipoAviso, { icono: typeof Bell; color: string }> = {
  POR_VENCER: { icono: CreditCard, color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  VENCE_HOY: { icono: CreditCard, color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  VENCIDA: { icono: CreditCard, color: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400' },
  LUGAR: { icono: CalendarCheck, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  CANCELADA: { icono: CalendarX, color: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400' },
  RECORDATORIO: { icono: AlarmClock, color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400' },
};

function cuando(iso: string) {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoy.toDateString()) return `Hoy, ${hora}`;
  if (d.toDateString() === ayer.toDateString()) return `Ayer, ${hora}`;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}

/**
 * Avisos del cliente (docs/plan-avisos-automaticos.md, fase 2). Al abrir la
 * pantalla quedan leídos; los que eran nuevos se siguen resaltando mientras
 * esté abierta.
 */
export default function AvisosPortal() {
  const queryClient = useQueryClient();
  const { data: avisos, isLoading } = useQuery({ queryKey: ['portal-avisos'], queryFn: () => apiGet<Aviso[]>('/portal/avisos') });
  const marcados = useRef(false);

  useEffect(() => {
    if (!avisos || marcados.current || !avisos.some((a) => !a.leido)) return;
    marcados.current = true;
    apiPost('/portal/avisos/leidos', {})
      .then(() => queryClient.invalidateQueries({ queryKey: ['portal-yo'] }))
      .catch(() => {});
  }, [avisos, queryClient]);

  if (isLoading) return <div className="h-48 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Avisos</h1>

      {!avisos || avisos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
          <Bell className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Aquí te avisaremos cuando tu membresía esté por vencer, antes de tus clases y si hay cambios en ellas.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {avisos.map((a) => {
            const { icono: Icono, color } = ICONO[a.tipo ?? 'RECORDATORIO'];
            return (
              <li
                key={a.id}
                className={`flex gap-3 rounded-2xl border p-4 ${
                  a.leido
                    ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                    : 'border-indigo-200 bg-indigo-50/60 dark:border-indigo-500/30 dark:bg-indigo-500/10'
                }`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${color}`}>
                  <Icono className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-semibold">{a.titulo}</p>
                    <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{cuando(a.fecha)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{a.mensaje}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
