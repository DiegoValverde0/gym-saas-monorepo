"use client";

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Protect } from '@/components/ui/protect';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPost } from '@/lib/api-client';
import { CalendarX, Undo2 } from 'lucide-react';
import { Ausencia, fechaCorta } from './compartido';

/**
 * Vista "Ausencias" (plan 7.2 c): las ausencias por rango, armadas en el
 * servidor a partir de las jornadas ausentes seguidas de cada persona.
 */
export function VistaAusencias() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [aQuitar, setAQuitar] = useState<Ausencia | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['jornadas', 'ausencias'],
    queryFn: async () => apiGet<{ hoy: string; ausencias: Ausencia[] }>('/turnos/ausencias'),
  });

  const quitar = useMutation({
    mutationFn: async (a: Ausencia) => apiPost<{ jornadasRestablecidas: number }>('/turnos/ausencias/quitar', { staffId: a.staffId, desde: a.desde, hasta: a.hasta }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jornadas'] });
      queryClient.invalidateQueries({ queryKey: ['agenda'] });
      toast({ title: 'Ausencia quitada', description: 'Sus jornadas vuelven a estar programadas.', variant: 'success' });
    },
    onError: (err: Error) => toast({ title: 'No se pudo quitar', description: err.message, variant: 'destructive' }),
  });

  if (isLoading || !data) {
    return <div className="h-40 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />;
  }

  const vigentes = data.ausencias.filter((a) => a.hasta >= data.hoy);
  const pasadas = data.ausencias.filter((a) => a.hasta < data.hoy).reverse();

  const lista = (items: Ausencia[], sePuedeQuitar: boolean) => (
    <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      {items.map((a) => {
        const enCurso = a.desde <= data.hoy && a.hasta >= data.hoy;
        return (
          <div key={`${a.staffId}-${a.desde}`} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 dark:text-white truncate">
                {a.staffNombre}
                {enCurso && <span className="ml-2 rounded-full bg-rose-100 dark:bg-rose-500/20 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300">Hoy</span>}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {a.desde === a.hasta ? fechaCorta(a.desde) : `${fechaCorta(a.desde)} – ${fechaCorta(a.hasta)}`} · {a.dias} {a.dias === 1 ? 'día' : 'días'} de trabajo · {a.motivo}
              </p>
            </div>
            {sePuedeQuitar && (
              <Protect permission="turnos:actualizar">
                <Button size="sm" variant="ghost" onClick={() => setAQuitar(a)} className="self-start sm:self-auto text-slate-600 dark:text-slate-300">
                  <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Quitar
                </Button>
              </Protect>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">En curso y próximas</h3>
        {vigentes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            <CalendarX className="mx-auto mb-2 h-6 w-6 text-slate-300 dark:text-slate-600" />
            No hay ausencias registradas. Usa &quot;Registrar ausencia&quot; para vacaciones, enfermedad o permisos.
          </div>
        ) : (
          lista(vigentes, true)
        )}
      </section>
      {pasadas.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">Pasadas (últimos 2 meses)</h3>
          {lista(pasadas, false)}
        </section>
      )}

      <GlobalConfirmDialog
        open={!!aQuitar}
        onOpenChange={(abierto) => !abierto && setAQuitar(null)}
        title="¿Quitar la ausencia?"
        description={
          aQuitar
            ? `${aQuitar.staffNombre} vuelve a tener sus jornadas programadas del ${fechaCorta(aQuitar.desde)} al ${fechaCorta(aQuitar.hasta)}. Las clases que pasaron a un reemplazo siguen con el reemplazo.`
            : ''
        }
        onConfirm={() => aQuitar && quitar.mutate(aQuitar)}
        isDestructive={false}
      />
    </div>
  );
}
