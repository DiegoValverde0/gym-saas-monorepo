"use client";

import { useQuery } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet } from '@/lib/api-client';
import { PrimerosPasos } from '@/components/ui/primeros-pasos';
import { useModoUso } from '@/hooks/use-modo-uso';
import { AccionesRapidas } from '@/components/ui/acciones-rapidas';
import { Indicadores, IndicadoresCargando, Kpis } from '@/components/inicio/indicadores';
import { Tablero } from '@/components/inicio/tablero';
import { ParaSaber } from '@/components/inicio/para-saber';
import { AvisoEjemplos, ConEjemplos, useEjemplos } from '@/components/inicio/ejemplos';
import { kpisDeEjemplo } from '@/lib/ejemplos';

/**
 * El Inicio (docs/plan-inicio.md): los indicadores con su comparación, "Lo que
 * hay que saber hoy" y, debajo, las tarjetas del gimnasio (gráficos y listas
 * de la reportería). Sin datos todavía, con números de ejemplo. En modo
 * simple, lo mismo con las acciones rápidas arriba y un tablero más sencillo
 * (decisión I7).
 */
export default function DashboardPage() {
  const { token } = useAuth();
  const { activeTenantId } = useTenantStore();
  const { esSimple } = useModoUso();

  const { data: kpis } = useQuery({
    queryKey: ['dashboard-kpis', activeTenantId],
    queryFn: async () => apiGet<Kpis>('/dashboard/kpis'),
    enabled: !!token,
  });

  const ejemplos = useEjemplos(kpis);
  const kpisVista = kpis && ejemplos.activos ? kpisDeEjemplo(kpis) : kpis;

  if (!token) return null;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Inicio</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Lo que pasa hoy en tu gimnasio.</p>
      </div>

      {/* data-recorrido: lo que resalta la guía del modo simple (components/ui/recorrido.tsx). */}
      <ConEjemplos value={ejemplos.activos}>
        {/* En modo simple, lo que más se hace va primero. */}
        {esSimple && <div data-recorrido="acciones"><AccionesRapidas /></div>}

        <AvisoEjemplos {...ejemplos} />

        {/* Indicadores con comparación y tendencia: lo primero que se ve. */}
        <div data-recorrido="resumen">{kpisVista ? <Indicadores kpis={kpisVista} /> : <IndicadoresCargando />}</div>

        <ParaSaber />

        <PrimerosPasos />

        {!esSimple && <div data-recorrido="acciones"><AccionesRapidas /></div>}

        <Tablero />
      </ConEjemplos>
    </div>
  );
}
