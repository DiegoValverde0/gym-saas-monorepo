"use client";

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useSucursalActiva } from '@/hooks/use-sucursal-activa';
import { apiGet } from '@/lib/api-client';

interface Resumen {
  hoy: { ingresos: number; ventas: number; asistencias: number };
  mes: { ingresos: number };
}

const bs = (n: number) => `Bs. ${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * KPIs del Dashboard en modo simple (plan 11.13): cobrado hoy, ingresos al
 * gimnasio hoy y cobrado en el mes, desde /reportes/resumen (hora local de la
 * organización).
 */
export function ResumenHoy() {
  const { token } = useAuth();
  const { hasPermission } = usePermissions();
  const { sucursalId } = useSucursalActiva();
  const puede = hasPermission('transacciones:leer');
  const { data } = useQuery({
    queryKey: ['reportes', 'resumen', sucursalId],
    queryFn: async () => apiGet<Resumen>(`/reportes/resumen${sucursalId ? `?sucursalId=${sucursalId}` : ''}`),
    enabled: !!token && puede,
    refetchInterval: 60 * 1000,
  });
  if (!puede || !data) return null;

  const tile = (titulo: string, valor: string, detalle: string) => (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{titulo}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{valor}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detalle}</p>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tile('Cobrado hoy', bs(data.hoy.ingresos), `${data.hoy.ventas} ${data.hoy.ventas === 1 ? 'venta' : 'ventas'}`)}
        {tile('Ingresos al gimnasio hoy', String(data.hoy.asistencias), 'Personas que entraron')}
        {tile('Cobrado este mes', bs(data.mes.ingresos), 'Desde el día 1')}
      </div>
      <Link href="/dashboard/reportes" className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">Ver reportes</Link>
    </div>
  );
}
