"use client";

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { apiGet, apiPut } from '@/lib/api-client';
import { useModoUso } from '@/hooks/use-modo-uso';
import { usePermissions } from '@/hooks/use-permissions';

interface EstadoPasos { plan: boolean; cliente: boolean; venta: boolean; ingreso: boolean }

const PASOS: { clave: keyof EstadoPasos; texto: string; href: string }[] = [
  { clave: 'plan', texto: 'Revisa tus planes y sus precios', href: '/dashboard/planes' },
  { clave: 'cliente', texto: 'Registra tu primer cliente', href: '/dashboard/clientes' },
  { clave: 'venta', texto: 'Véndele su membresía', href: '/dashboard/membresias' },
  { clave: 'ingreso', texto: 'Registra su ingreso', href: '/dashboard/asistencias' },
];

/**
 * Lista de primeros pasos del Dashboard (plan de simplificación, 4.5). Solo
 * en organizaciones que pasaron por el asistente de inicio; cada paso se marca
 * solo cuando se cumple. Se puede cerrar.
 */
export function PrimerosPasos() {
  const { onboarding } = useModoUso();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const visible = !!onboarding && onboarding.completado === true && !onboarding.primerosPasosOcultos;

  const { data } = useQuery({
    queryKey: ['primeros-pasos'],
    queryFn: async () => apiGet<EstadoPasos>('/organizaciones/me/primeros-pasos'),
    enabled: visible,
  });

  const ocultar = useMutation({
    mutationFn: async () => apiPut('/organizaciones/me/info', { configuracion: { onboarding: { primerosPasosOcultos: true } } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizacion'] }),
  });

  if (!visible || !data) return null;
  const hechos = PASOS.filter((p) => data[p.clave]).length;
  const terminado = hechos === PASOS.length;

  return (
    <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-500/10 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white">{terminado ? '¡Ya estás funcionando!' : 'Primeros pasos'}</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {terminado ? 'Completaste los primeros pasos. Puedes cerrar esta lista.' : `${hechos} de ${PASOS.length} listos.`}
          </p>
        </div>
        {hasPermission('organizaciones:actualizar') && (
          <button type="button" onClick={() => ocultar.mutate()} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Cerrar primeros pasos">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {PASOS.map((p, i) => (
          <li key={p.clave}>
            <Link
              href={p.href}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${data[p.clave] ? 'border-transparent text-slate-500 dark:text-slate-400 line-through' : 'border-indigo-200 dark:border-indigo-900/50 bg-white dark:bg-slate-900 font-medium text-slate-800 dark:text-slate-100 hover:border-indigo-400'}`}
            >
              {data[p.clave] ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <Circle className="h-4 w-4 text-indigo-400 shrink-0" />}
              {i + 1}. {p.texto}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
