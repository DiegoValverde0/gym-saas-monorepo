"use client";

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useTenantStore } from '@/store/use-tenant-store';
import { CLASE_TAMANO, DISENO_SUGERIDO, RANGOS_TARJETA, TarjetaTablero } from '@/lib/tablero';
import { PorVencer } from '@/components/ui/por-vencer';
import { GraficoReporte } from '@/app/dashboard/reporteria/grafico-reporte';
import { formatearValor, NOMBRE_RANGO, RangoFecha, ReporteGuardado, Resultado } from '@/app/dashboard/reporteria/tipos';

// Las tarjetas del Inicio (docs/plan-inicio.md, fase 2): gráficos y listas de
// la reportería (plantillas y reportes guardados), el estado de los clientes
// y los vencimientos, en el orden y tamaño que guardó el gimnasio.

type Ejecucion = Resultado & { reporte: ReporteGuardado };

const claseTarjeta = 'flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900';
const claseSelector =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';

/** Las primeras filas de un reporte de lista (sin gráfico), con sus primeras columnas. */
function ListaCorta({ resultado }: { resultado: Resultado }) {
  const columnas = resultado.columnas.slice(0, 3);
  return (
    <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
      {(resultado.filas ?? []).slice(0, 6).map((f, i) => (
        <li key={i} className="flex items-baseline justify-between gap-3 py-2">
          <span className="min-w-0 truncate font-medium text-slate-900 dark:text-white">{formatearValor(f[columnas[0].clave], columnas[0].tipo, columnas[0].opciones)}</span>
          <span className="shrink-0 truncate text-xs text-slate-500 dark:text-slate-400">
            {columnas
              .slice(1)
              .map((c) => formatearValor(f[c.clave], c.tipo, c.opciones))
              .join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Una tarjeta que corre un reporte (plantilla o guardado) con su período. */
function TarjetaReporte({ reporteId, nombre, rangoInicial }: { reporteId: string; nombre?: string; rangoInicial?: RangoFecha }) {
  const [rango, setRango] = useState<RangoFecha | undefined>(rangoInicial);
  const { data, isLoading, error } = useQuery({
    queryKey: ['inicio-tarjeta', reporteId, rango],
    queryFn: () => apiPost<Ejecucion>(`/reporteria/reportes/${reporteId}/ejecutar`, { porPagina: 6, ...(rango ? { filtros: { fecha: { rango } } } : {}) }),
    placeholderData: (anterior) => anterior,
    meta: { silencioso: true },
    retry: false,
  });
  const titulo = data?.reporte.nombre ?? nombre ?? 'Reporte';
  const rangoActual = rango ?? data?.definicion.filtros.fecha.rango;
  const conGrafico = data?.definicion.grafico && data.definicion.formato !== 'LISTA';
  const vacio = data && data.totalFilas === 0;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-slate-900 dark:text-white">{titulo}</h3>
          {data?.reporte.descripcion && <p className="text-xs text-slate-500 dark:text-slate-400">{data.reporte.descripcion}</p>}
        </div>
        <div className="flex items-center gap-2">
          {rangoActual && rangoActual !== 'personalizado' && (
            <select aria-label={`Período de ${titulo}`} className={claseSelector} value={rangoActual} onChange={(e) => setRango(e.target.value as RangoFecha)}>
              {RANGOS_TARJETA.map((r) => (
                <option key={r} value={r}>
                  {NOMBRE_RANGO[r]}
                </option>
              ))}
            </select>
          )}
          <Link
            href={`/dashboard/reporteria/${reporteId}`}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
            aria-label={`Ver el reporte completo: ${titulo}`}
          >
            Ver completo <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
      {isLoading ? (
        <div className="h-56 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      ) : error ? (
        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{(error as Error).message}</p>
      ) : vacio ? (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">No hay datos en este período.</p>
      ) : data && conGrafico ? (
        <GraficoReporte resultado={data} enTarjeta />
      ) : data ? (
        <ListaCorta resultado={data} />
      ) : null}
    </>
  );
}

// Estado de los clientes según sus membresías (los mismos grupos de la ficha del cliente).
const GRUPOS_ESTADO = [
  { nombre: 'Al día', segmentos: ['ACTIVO_VIGENTE'], clase: 'bg-emerald-500' },
  { nombre: 'Por empezar', segmentos: ['ACTIVO_ENCOLADO'], clase: 'bg-indigo-500' },
  { nombre: 'Vencida', segmentos: ['INACTIVO_VENCIDO_RECIENTE', 'INACTIVO_ABANDONO_TEMPRANO', 'INACTIVO_CHURN'], clase: 'bg-amber-500' },
  { nombre: 'Sin membresía', segmentos: ['PROSPECTO'], clase: 'bg-slate-400 dark:bg-slate-500' },
];

/** Barra apilada de los clientes por estado (decisión I6: en vez de la torta). */
function TarjetaEstadoClientes() {
  const { token } = useAuth();
  const { activeTenantId } = useTenantStore();
  const { data } = useQuery({
    queryKey: ['dashboard-segmentacion', activeTenantId],
    queryFn: () => apiGet<{ total: number; porSegmento: Record<string, number> }>('/dashboard/segmentacion-clientes'),
    enabled: !!token,
  });
  const grupos = GRUPOS_ESTADO.map((g) => ({ ...g, cantidad: g.segmentos.reduce((s, x) => s + (data?.porSegmento[x] ?? 0), 0) }));
  const total = data?.total ?? 0;
  const porcentaje = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Estado de los clientes</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Según sus membresías, de {total.toLocaleString('es-ES')} registrados.</p>
        </div>
        <Link href="/dashboard/clientes" className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10">
          Ver clientes <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      {!data ? (
        <div className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      ) : total === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Todavía no hay clientes.</p>
      ) : (
        <>
          {/* Una barra con las partes separadas por 2 px del fondo de la tarjeta. */}
          <div className="flex h-5 w-full gap-0.5 overflow-hidden rounded-md" role="img" aria-label={grupos.map((g) => `${g.nombre}: ${g.cantidad}`).join(', ')}>
            {grupos
              .filter((g) => g.cantidad > 0)
              .map((g) => (
                <div key={g.nombre} className={`${g.clase} h-full first:rounded-l-md last:rounded-r-md`} style={{ width: `${(g.cantidad / total) * 100}%` }} title={`${g.nombre}: ${g.cantidad}`} />
              ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {grupos.map((g) => (
              <li key={g.nombre} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${g.clase}`} aria-hidden />
                <span className="text-slate-600 dark:text-slate-300">{g.nombre}</span>
                <span className="ml-auto font-semibold tabular-nums text-slate-900 dark:text-white">{g.cantidad.toLocaleString('es-ES')}</span>
                <span className="w-9 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">{porcentaje(g.cantidad)} %</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** El tablero de tarjetas del Inicio, con el diseño guardado (o el sugerido). */
export function Tablero() {
  const { token, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const verReportes = hasPermission('reportes:leer');
  const { data: org } = useQuery({
    queryKey: ['organizacion'],
    queryFn: () => apiGet<{ configuracion?: { tablero?: { tarjetas?: TarjetaTablero[] } } | null }>('/organizaciones/me/info'),
    enabled: !!token && !isSuperAdmin,
  });
  const { data: plantillas } = useQuery({
    queryKey: ['reporteria-reportes', 'plantillas', '', ''],
    queryFn: () => apiGet<ReporteGuardado[]>('/reporteria/reportes?vista=plantillas'),
    enabled: !!token && verReportes,
  });
  const tarjetas = org?.configuracion?.tablero?.tarjetas ?? DISENO_SUGERIDO;
  const idPlantilla = new Map((plantillas ?? []).filter((p) => p.clavePlantilla).map((p) => [p.clavePlantilla!, p]));

  // Cada tarjeta, si esta persona la puede ver (permiso, módulo del gimnasio).
  const visibles = tarjetas.flatMap((t) => {
    if (t.id === 'estado-clientes') return hasPermission('clientes:leer') ? [{ t, contenido: <TarjetaEstadoClientes /> }] : [];
    if (t.id === 'por-vencer') return hasPermission('membresias:leer') ? [{ t, contenido: <PorVencer limite={8} enTarjeta /> }] : [];
    if (!verReportes) return [];
    if (t.id.startsWith('plantilla:')) {
      const p = idPlantilla.get(t.id.slice('plantilla:'.length));
      return p ? [{ t, contenido: <TarjetaReporte reporteId={p.id} nombre={p.nombre} rangoInicial={t.rango} /> }] : [];
    }
    if (t.id.startsWith('reporte:')) return [{ t, contenido: <TarjetaReporte reporteId={t.id.slice('reporte:'.length)} rangoInicial={t.rango} /> }];
    return [];
  });
  if (visibles.length === 0) return null;

  return (
    <div className="grid grid-cols-6 gap-4">
      {visibles.map(({ t, contenido }) => (
        <section key={t.id} data-tarjeta={t.id} className={`${claseTarjeta} ${CLASE_TAMANO[t.tamano]}`}>
          {contenido}
        </section>
      ))}
    </div>
  );
}
