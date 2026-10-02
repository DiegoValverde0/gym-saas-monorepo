"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, buttonVariants } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { useSucursalActiva } from '@/hooks/use-sucursal-activa';
import { useToast } from '@/hooks/use-toast';
import { apiDescargar, apiPost } from '@/lib/api-client';
import { ArrowLeft, Copy, Download, FileSpreadsheet, Loader2, Pencil, Printer, RotateCcw } from 'lucide-react';
import { useCatalogo, useReporte } from '../datos';
import { claseCampo } from '../editor-filtros';
import { TablaResultados } from '../tabla-resultados';
import { NOMBRE_RANGO, RangoFecha, ReporteGuardado, Resultado } from '../tipos';

type Ejecucion = Resultado & { reporte: ReporteGuardado };

interface FiltrosMomento {
  fecha?: { rango: RangoFecha; desde?: string; hasta?: string };
  sucursalId?: string | null;
}

const horaCorta = (ms: number) => new Date(ms).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Ver un reporte guardado (docs/plan-reporteria.md, fase 5): filtros rápidos
 * que no cambian lo guardado, páginas de 50 filas, exportar a CSV o Excel
 * (todas las filas, hasta 50.000) e imprimir (hasta 2.000).
 */
export default function VerReportePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const { data: catalogo } = useCatalogo();
  const { sucursales, esFija } = useSucursalActiva();
  const { data: reporte } = useReporte(params.id);
  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState<FiltrosMomento>({});
  const [imprimiendo, setImprimiendo] = useState(false);

  const cuerpo = { ...(filtros.fecha || 'sucursalId' in filtros ? { filtros } : {}) };
  const { data: resultado, error, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['reporteria-ejecucion', params.id, pagina, filtros],
    queryFn: () => apiPost<Ejecucion>(`/reporteria/reportes/${params.id}/ejecutar`, { ...cuerpo, pagina }),
    placeholderData: (anterior) => anterior,
    retry: false,
    meta: { silencioso: true },
  });

  // Imprimir: se piden todas las filas que se pueden ver (hasta 2.000) y,
  // cuando llegan, se abre el diálogo de impresión del navegador.
  const paraImprimir = useQuery({
    queryKey: ['reporteria-impresion', params.id, filtros],
    queryFn: () => apiPost<Ejecucion>(`/reporteria/reportes/${params.id}/ejecutar`, { ...cuerpo, pagina: 1, porPagina: 2000 }),
    enabled: imprimiendo,
    retry: false,
    meta: { silencioso: true },
  });
  useEffect(() => {
    if (!imprimiendo || !paraImprimir.data) return;
    // En papel, siempre los colores claros (texto oscuro sobre blanco).
    const html = document.documentElement;
    const oscuro = html.classList.contains('dark');
    html.classList.remove('dark');
    const fin = () => {
      if (oscuro) html.classList.add('dark');
      setImprimiendo(false);
    };
    window.addEventListener('afterprint', fin, { once: true });
    // Un instante para que la tabla completa termine de dibujarse.
    const t = setTimeout(() => window.print(), 300);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', fin);
    };
  }, [imprimiendo, paraImprimir.data]);
  useEffect(() => {
    if (imprimiendo && paraImprimir.error) {
      toast({ title: 'No se pudo preparar la impresión', description: (paraImprimir.error as Error).message, variant: 'destructive' });
      setImprimiendo(false);
    }
  }, [imprimiendo, paraImprimir.error, toast]);

  const exportar = useMutation({
    mutationFn: (formato: 'csv' | 'xlsx') => apiDescargar(`/reporteria/reportes/${params.id}/exportar?formato=${formato}`, cuerpo),
    onError: (err: Error) => toast({ title: 'No se pudo exportar', description: err.message, variant: 'destructive' }),
  });
  const duplicar = useMutation({
    mutationFn: () => apiPost<ReporteGuardado>(`/reporteria/reportes/${params.id}/duplicar`, {}),
    onSuccess: (r) => router.push(`/dashboard/reporteria/${r.id}/editar`),
    onError: (err: Error) => toast({ title: 'No se pudo duplicar', description: err.message, variant: 'destructive' }),
  });

  const info = resultado?.reporte ?? reporte;
  const guardados = resultado?.definicion.filtros;
  const rango = filtros.fecha?.rango ?? guardados?.fecha.rango ?? 'todo';
  const sucursalId = 'sucursalId' in filtros ? filtros.sucursalId ?? '' : guardados?.sucursalId ?? '';
  const cambiado = !!filtros.fecha || 'sucursalId' in filtros;
  const cambiar = (f: FiltrosMomento) => {
    setFiltros({ ...filtros, ...f });
    setPagina(1);
  };
  const totalPaginas = resultado?.filas ? Math.max(1, Math.ceil(Math.min(resultado.totalFilas, 2000) / resultado.porPagina)) : 1;
  // Lo de modo experto solo se arma (y se copia para cambiarlo) en modo experto.
  const puedeDuplicar = hasPermission('reportes:crear') && catalogo?.modo !== 'simple' && (catalogo?.avanzado || !reporte?.usaModoExperto);
  const mostrado = imprimiendo && paraImprimir.data ? paraImprimir.data : resultado;
  const sucursalNombre = sucursales.find((s) => s.id === (sucursalId || null))?.nombre;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <Link href="/dashboard/reporteria" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 print:hidden" aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white print:text-black">{info?.nombre ?? 'Reporte'}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {info?.tipo.nombre}
            {info?.descripcion ? ` · ${info.descripcion}` : ''}
          </p>
          {/* En papel: qué filtros tiene y cuándo se sacó. */}
          <p className="hidden text-sm text-slate-600 print:block">
            {NOMBRE_RANGO[rango]}
            {sucursalNombre ? ` · ${sucursalNombre}` : ''} · Impreso el {horaCorta(Date.now())}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" className="dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800" disabled={exportar.isPending || !resultado} onClick={() => exportar.mutate('xlsx')}>
            {exportar.isPending && exportar.variables === 'xlsx' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-4 w-4" />} Excel
          </Button>
          <Button variant="outline" className="dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800" disabled={exportar.isPending || !resultado} onClick={() => exportar.mutate('csv')}>
            {exportar.isPending && exportar.variables === 'csv' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />} CSV
          </Button>
          <Button variant="outline" className="dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800" disabled={imprimiendo || !resultado} onClick={() => setImprimiendo(true)}>
            {imprimiendo ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Printer className="mr-1.5 h-4 w-4" />} Imprimir
          </Button>
          {puedeDuplicar && (
            <Button variant="ghost" className="dark:text-slate-300 dark:hover:bg-slate-800" disabled={duplicar.isPending} onClick={() => duplicar.mutate()}>
              <Copy className="mr-1.5 h-4 w-4" /> Duplicar
            </Button>
          )}
          {info?.puedeEditar && (
            <Link href={`/dashboard/reporteria/${params.id}/editar`} className={buttonVariants()}>
              <Pencil className="mr-1.5 h-4 w-4" /> Editar
            </Link>
          )}
        </div>
      </div>

      {/* Filtros rápidos: cambian lo que se ve ahora, no el reporte guardado. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 print:hidden">
        <select
          className={claseCampo}
          aria-label="Rango de fechas"
          value={rango}
          onChange={(e) => {
            const nuevo = e.target.value as RangoFecha;
            cambiar({ fecha: nuevo === 'personalizado' ? { rango: nuevo, desde: guardados?.fecha.desde, hasta: guardados?.fecha.hasta } : { rango: nuevo } });
          }}
        >
          {(Object.keys(NOMBRE_RANGO) as RangoFecha[]).map((r) => (
            <option key={r} value={r}>
              {NOMBRE_RANGO[r]}
            </option>
          ))}
        </select>
        {rango === 'personalizado' && (
          <>
            <input
              type="date"
              className={claseCampo}
              aria-label="Desde"
              value={filtros.fecha?.desde ?? guardados?.fecha.desde ?? ''}
              onChange={(e) => cambiar({ fecha: { rango: 'personalizado', desde: e.target.value || undefined, hasta: filtros.fecha?.hasta ?? guardados?.fecha.hasta } })}
            />
            <span className="text-sm text-slate-500">al</span>
            <input
              type="date"
              className={claseCampo}
              aria-label="Hasta"
              value={filtros.fecha?.hasta ?? guardados?.fecha.hasta ?? ''}
              onChange={(e) => cambiar({ fecha: { rango: 'personalizado', desde: filtros.fecha?.desde ?? guardados?.fecha.desde, hasta: e.target.value || undefined } })}
            />
          </>
        )}
        {!esFija && sucursales.length > 1 && (
          <select className={claseCampo} aria-label="Sucursal" value={sucursalId} onChange={(e) => cambiar({ sucursalId: e.target.value || null })}>
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        )}
        {cambiado && (
          <Button
            size="sm"
            variant="ghost"
            className="dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => {
              setFiltros({});
              setPagina(1);
            }}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Como está guardado
          </Button>
        )}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {dataUpdatedAt > 0 && (
            <button type="button" onClick={() => refetch()} className="hover:underline" title="Volver a calcular">
              Datos de las {horaCorta(dataUpdatedAt)}
            </button>
          )}
        </span>
      </div>

      {error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          {(error as Error).message}
        </p>
      ) : !mostrado ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : (
        <>
          <TablaResultados resultado={mostrado} />
          {!imprimiendo && totalPaginas > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-300 print:hidden">
              <span>
                Página {pagina} de {totalPaginas}
                {resultado?.recortado && ' · en pantalla se ven las primeras 2.000 filas; exporta para tenerlas todas'}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" disabled={pagina === 1 || isFetching} onClick={() => setPagina(pagina - 1)}>
                  Anterior
                </Button>
                <Button size="sm" variant="outline" className="dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" disabled={pagina >= totalPaginas || isFetching} onClick={() => setPagina(pagina + 1)}>
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
