"use client";

import { useInfiniteQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api-client';
import { Asistencia, diaLargo, hora } from '../datos';

interface Pagina {
  data: Asistencia[];
  total: number;
  page: number;
  totalPaginas: number;
}

const POR_PAGINA = 20;

export default function AsistenciasPortal() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['portal-asistencias'],
    queryFn: ({ pageParam }) => apiGet<Pagina>(`/portal/asistencias?page=${pageParam}&limit=${POR_PAGINA}`),
    initialPageParam: 1,
    getNextPageParam: (ultima) => (ultima.page < ultima.totalPaginas ? ultima.page + 1 : undefined),
  });

  if (isLoading) return <div className="h-48 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />;
  const asistencias = data?.pages.flatMap((p) => p.data) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Asistencias</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {total === 0 ? 'Aquí verás cada vez que vengas al gimnasio.' : total === 1 ? 'Viniste 1 vez.' : `Viniste ${total} veces.`}
        </p>
      </div>

      {asistencias.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {asistencias.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium">{diaLargo(a.ingreso)}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{a.sucursal}</p>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {hora(a.ingreso)}
                {a.salida ? ` – ${hora(a.salida)}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}

      {hasNextPage && (
        <Button variant="outline" className="w-full" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
          {isFetchingNextPage ? 'Cargando…' : 'Ver más'}
        </Button>
      )}
    </div>
  );
}
