"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button, buttonVariants } from '@/components/ui/button';
import { apiPost } from '@/lib/api-client';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useReporte } from '../datos';
import { TablaResultados } from '../tabla-resultados';
import { ReporteGuardado, Resultado } from '../tipos';

/**
 * Ver un reporte guardado (fase 4: correrlo y paginar). La fase 5 suma los
 * filtros rápidos, la exportación y la impresión.
 */
export default function VerReportePage({ params }: { params: { id: string } }) {
  const [pagina, setPagina] = useState(1);
  const { data: reporte } = useReporte(params.id);
  const { data: resultado, error, isFetching } = useQuery({
    queryKey: ['reporteria-ejecucion', params.id, pagina],
    queryFn: () => apiPost<Resultado & { reporte: ReporteGuardado }>(`/reporteria/reportes/${params.id}/ejecutar`, { pagina }),
    placeholderData: (anterior) => anterior,
    retry: false,
    meta: { silencioso: true },
  });
  const info = resultado?.reporte ?? reporte;
  const totalPaginas = resultado?.filas ? Math.ceil(Math.min(resultado.totalFilas, 2000) / resultado.porPagina) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <Link href="/dashboard/reporteria" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{info?.nombre ?? 'Reporte'}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {info?.tipo.nombre}
            {info?.descripcion ? ` · ${info.descripcion}` : ''}
          </p>
        </div>
        {info?.puedeEditar && (
          <Link href={`/dashboard/reporteria/${params.id}/editar`} className={buttonVariants({ variant: 'outline' })}>
            <Pencil className="mr-1.5 h-4 w-4" /> Editar
          </Link>
        )}
      </div>

      {error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          {(error as Error).message}
        </p>
      ) : !resultado ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : (
        <>
          <TablaResultados resultado={resultado} />
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
              <span>
                Página {pagina} de {totalPaginas}
                {resultado.recortado && ' (en pantalla se ven las primeras 2.000 filas)'}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={pagina === 1 || isFetching} onClick={() => setPagina(pagina - 1)}>
                  Anterior
                </Button>
                <Button size="sm" variant="outline" disabled={pagina >= totalPaginas || isFetching} onClick={() => setPagina(pagina + 1)}>
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
