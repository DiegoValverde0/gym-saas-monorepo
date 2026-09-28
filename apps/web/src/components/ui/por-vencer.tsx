"use client";

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useTenantStore } from '@/store/use-tenant-store';
import { apiGet } from '@/lib/api-client';
import { FichaCliente } from '@/components/ui/ficha-cliente';
import { enlaceWhatsapp } from '@/lib/whatsapp';
import { MessageCircle } from 'lucide-react';

interface PorVencer {
  clienteId: string;
  cliente: string;
  telefono: string | null;
  plan: string;
  fechaFin: string | null;
  diasRestantes: number | null;
}

const cuando = (d: number | null) => (d == null ? '' : d === 0 ? 'vence hoy' : d === 1 ? 'vence mañana' : `vence en ${d} días`);

/**
 * "Membresías por vencer esta semana" (plan 11.13), con botón para avisar por
 * WhatsApp y acceso a la ficha del cliente para renovar.
 */
export function PorVencer() {
  const { token, isSuperAdmin } = useAuth();
  const { activeTenantId } = useTenantStore();
  const [fichaId, setFichaId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['dashboard-por-vencer', activeTenantId],
    queryFn: async () => apiGet<PorVencer[]>('/dashboard/por-vencer'),
    enabled: !!token,
  });
  const { data: org } = useQuery({
    queryKey: ['organizacion'],
    queryFn: async () => apiGet<{ nombre?: string; moneda?: string }>('/organizaciones/me/info'),
    enabled: !!token && !isSuperAdmin,
  });

  if (!data) return null;

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="flex items-baseline justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3">
        <h3 className="font-semibold text-slate-900 dark:text-white">Membresías por vencer esta semana</h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">{data.length} {data.length === 1 ? 'cliente' : 'clientes'}</span>
      </div>
      {data.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">Nadie vence en los próximos 7 días.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.map((m) => (
            <li key={m.clienteId} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <button type="button" onClick={() => setFichaId(m.clienteId)} className="min-w-0 text-left">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-white hover:underline">{m.cliente}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{m.plan} · {cuando(m.diasRestantes)}</p>
              </button>
              {m.telefono ? (
                <a
                  href={enlaceWhatsapp(
                    m.telefono,
                    `Hola ${m.cliente.split(' ')[0]}, te escribimos de ${org?.nombre ?? 'tu gimnasio'}: tu membresía ${m.plan} ${cuando(m.diasRestantes)}. ¿Quieres renovarla?`,
                    org?.moneda,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-300 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> Avisar
                </a>
              ) : (
                <span className="shrink-0 text-xs text-slate-400">Sin teléfono</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <FichaCliente clienteId={fichaId} onClose={() => setFichaId(null)} />
    </section>
  );
}
