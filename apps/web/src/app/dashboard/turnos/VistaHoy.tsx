"use client";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Protect } from '@/components/ui/protect';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPost } from '@/lib/api-client';
import { Clock, LogIn, LogOut, UserX } from 'lucide-react';
import { EstadoJornada, JornadaHoy, duracion, fechaCorta, fechaLarga, hhmm } from './compartido';

interface RespuestaHoy {
  fecha: string;
  ahora: number;
  toleranciaAtrasoMinutos: number;
  jornadas: JornadaHoy[];
}

type Variante = 'success' | 'primary' | 'warning' | 'destructive' | 'default';

function describir(j: JornadaHoy, ahora: number): { texto: string; variante: Variante; punto: string } {
  const tarde = j.minutosAtraso > 0 ? ` · ${duracion(j.minutosAtraso)} tarde` : '';
  const porEstado: Record<EstadoJornada, () => { texto: string; variante: Variante; punto: string }> = {
    por_empezar: () => ({ texto: ahora < j.inicio ? 'Aún no empieza' : 'Por llegar', variante: 'default', punto: 'bg-slate-300' }),
    atrasado: () => ({ texto: `Atrasado ${duracion(j.minutosAtraso)} (no marcó)`, variante: 'warning', punto: 'bg-amber-500' }),
    en_turno: () => ({ texto: `Llegó ${hhmm(j.ingresoReal ?? j.inicio)}${tarde}`, variante: 'success', punto: 'bg-emerald-500' }),
    termino: () => ({
      texto: j.ingresoReal != null ? `Terminó · ${hhmm(j.ingresoReal)}–${hhmm(j.salidaReal ?? j.fin)}${tarde}` : 'Terminó',
      variante: 'primary',
      punto: 'bg-indigo-400',
    }),
    no_marco: () => ({ texto: 'No marcó entrada', variante: 'destructive', punto: 'bg-rose-500' }),
    sin_marcar: () => ({ texto: 'Sin marcar', variante: 'default', punto: 'bg-slate-300' }),
    ausente: () => ({
      texto: `Ausente${j.motivoAusencia ? ` · ${j.motivoAusencia}` : ''}${j.ausenteHasta ? ` (hasta el ${fechaCorta(j.ausenteHasta)})` : ''}`,
      variante: 'destructive',
      punto: 'bg-rose-500',
    }),
    cancelado: () => ({ texto: 'Jornada cancelada', variante: 'default', punto: 'bg-slate-300' }),
  };
  return porEstado[j.estado]();
}

/**
 * Vista "Hoy" (plan 7.2 a): quién trabaja hoy en la sucursal activa y en qué
 * está, con los estados calculados en el servidor (llegó, atrasado, ausente…).
 */
export function VistaHoy({ sucursalId, onRegistrarAusencia }: { sucursalId: string | null; onRegistrarAusencia: (staffId: string) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['jornadas', 'hoy', sucursalId],
    queryFn: async () => apiGet<RespuestaHoy>(`/turnos/hoy${sucursalId ? `?sucursalId=${sucursalId}` : ''}`),
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const marcar = useMutation({
    mutationFn: async ({ id, accion }: { id: string; accion: 'ingreso' | 'salida' }) => apiPost(`/turnos/${id}/marcar-${accion}`),
    onSuccess: (_r, { accion }) => {
      queryClient.invalidateQueries({ queryKey: ['jornadas'] });
      toast({ title: accion === 'ingreso' ? 'Entrada marcada' : 'Salida marcada', variant: 'success' });
    },
    onError: (err: Error) => toast({ title: 'No se pudo marcar', description: err.message, variant: 'destructive' }),
  });

  if (isLoading || !data) {
    return <div className="h-40 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />;
  }

  const cuenta = (estados: EstadoJornada[]) => new Set(data.jornadas.filter((j) => estados.includes(j.estado)).map((j) => j.staffId)).size;
  const resumen = [
    { etiqueta: 'trabajando', n: cuenta(['en_turno']), clase: 'text-emerald-700 dark:text-emerald-300' },
    { etiqueta: 'atrasados', n: cuenta(['atrasado']), clase: 'text-amber-700 dark:text-amber-300' },
    { etiqueta: 'ausentes', n: cuenta(['ausente']), clase: 'text-rose-700 dark:text-rose-300' },
  ].filter((r) => r.n > 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-white first-letter:uppercase">{fechaLarga(data.fecha)}</p>
        {resumen.length > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {resumen.map((r, i) => (
              <span key={r.etiqueta}>
                {i > 0 && ' · '}
                <span className={`font-semibold ${r.clase}`}>{r.n}</span> {r.etiqueta}
              </span>
            ))}
          </p>
        )}
      </div>

      {data.jornadas.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
            <Clock className="h-6 w-6" />
          </div>
          <p className="font-semibold text-slate-900 dark:text-white">Nadie tiene jornada hoy en esta sucursal</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Las jornadas salen del horario semanal de cada persona, que se define en{' '}
            <Link href="/dashboard/personal" className="text-indigo-600 dark:text-indigo-400 underline underline-offset-2">Equipo</Link>.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          {data.jornadas.map((j) => {
            const d = describir(j, data.ahora);
            const puedeEntrar = j.estado === 'por_empezar' || j.estado === 'atrasado';
            const puedeAusencia = j.estado === 'por_empezar' || j.estado === 'atrasado' || j.estado === 'no_marco';
            return (
              <div key={j.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${d.punto}`} aria-hidden />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">{j.staffNombre}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {hhmm(j.inicio)} – {hhmm(j.fin)}
                      {!sucursalId && j.sucursalNombre ? ` · ${j.sucursalNombre}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end pl-5 sm:pl-0">
                  <Badge variant={d.variante}>{d.texto}</Badge>
                  <Protect permission="turnos:actualizar">
                    {puedeEntrar && (
                      <Button size="sm" variant="outline" onClick={() => marcar.mutate({ id: j.id, accion: 'ingreso' })} disabled={marcar.isPending}>
                        <LogIn className="mr-1.5 h-3.5 w-3.5" /> Marcar entrada
                      </Button>
                    )}
                    {j.estado === 'en_turno' && (
                      <Button size="sm" variant="outline" onClick={() => marcar.mutate({ id: j.id, accion: 'salida' })} disabled={marcar.isPending}>
                        <LogOut className="mr-1.5 h-3.5 w-3.5" /> Marcar salida
                      </Button>
                    )}
                    {puedeAusencia && (
                      <Button size="sm" variant="ghost" onClick={() => onRegistrarAusencia(j.staffId)} className="text-slate-600 dark:text-slate-300">
                        <UserX className="mr-1.5 h-3.5 w-3.5" /> Registrar ausencia
                      </Button>
                    )}
                  </Protect>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Se considera atrasado a quien no marcó {data.toleranciaAtrasoMinutos} minutos después de su hora de entrada. Cada persona marca su entrada y salida desde el botón de la barra superior, también en el celular.
      </p>
    </div>
  );
}
