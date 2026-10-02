"use client";

import { useQuery } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet } from '@/lib/api-client';
import { PrimerosPasos } from '@/components/ui/primeros-pasos';
import { PorVencer } from '@/components/ui/por-vencer';
import { ResumenHoy } from '@/components/ui/resumen-hoy';
import { useModoUso } from '@/hooks/use-modo-uso';
import { AccionesRapidas } from '@/components/ui/acciones-rapidas';
import { Indicadores, IndicadoresCargando, Kpis } from '@/components/inicio/indicadores';
import { Tablero } from '@/components/inicio/tablero';

/**
 * El Inicio (docs/plan-inicio.md): los indicadores con su comparación y, debajo,
 * las tarjetas del gimnasio (gráficos y listas de la reportería). En modo
 * simple, por ahora, lo del día y a quién avisar (plan 11.13; se adapta en la
 * fase 5).
 */
export default function DashboardPage() {
  const { token } = useAuth();
  const { activeTenantId } = useTenantStore();
  const { esSimple } = useModoUso();

  const { data: kpis } = useQuery({
    queryKey: ['dashboard-kpis', activeTenantId],
    queryFn: async () => apiGet<Kpis>('/dashboard/kpis'),
    enabled: !!token && !esSimple,
  });

  if (!token) return null;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Inicio</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Lo que pasa hoy en tu gimnasio.</p>
      </div>

      {/* Indicadores con comparación y tendencia: lo primero que se ve. */}
      {!esSimple && (kpis ? <Indicadores kpis={kpis} /> : <IndicadoresCargando />)}

      <PrimerosPasos />

      {/* data-recorrido: lo que resalta la guía del modo simple (components/ui/recorrido.tsx). */}
      <div data-recorrido="acciones"><AccionesRapidas /></div>

      {esSimple && <div data-recorrido="resumen"><ResumenHoy /></div>}

      {esSimple ? <div data-recorrido="por-vencer"><PorVencer /></div> : <Tablero />}
    </div>
  );
}
