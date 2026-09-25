"use client";

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Protect } from '@/components/ui/protect';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { StaffBasico, fechaCorta, hhmm, inputClass, sumarDias } from './compartido';

interface TurnoSemana {
  id: string;
  staffId: string;
  staffNombre: string;
  fecha: string;
  inicio: number;
  fin: number;
  estado: string;
}

interface Semana {
  dias: string[];
  hoy: string;
  turnos: TurnoSemana[];
}

const ESTILO_ESTADO: Record<string, string> = {
  PROGRAMADO: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  COMPLETADO: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
  AUSENTE: 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200',
  CANCELADO: 'bg-slate-50 text-slate-400 line-through dark:bg-slate-900 dark:text-slate-500',
};

const ESTADOS = [
  { valor: 'PROGRAMADO', etiqueta: 'Programada' },
  { valor: 'COMPLETADO', etiqueta: 'Trabajada' },
  { valor: 'AUSENTE', etiqueta: 'Ausente' },
  { valor: 'CANCELADO', etiqueta: 'Cancelada (no trabaja ese día)' },
];

interface Edicion {
  id: string | null; // null = jornada extra nueva
  staffId: string;
  fecha: string;
  horaEntrada: string;
  horaSalida: string;
  estado: string;
  motivoAusencia: string;
}

/**
 * Vista "Semana" (plan 7.2 b): las jornadas de la semana por persona, en la
 * sucursal activa. Tocar una jornada permite cambiarla solo ese día; "Jornada
 * extra" agrega un día fuera del horario habitual.
 */
export function VistaSemana({ sucursalId, equipo }: { sucursalId: string | null; equipo: StaffBasico[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [fechaRef, setFechaRef] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<Edicion | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['agenda', sucursalId, fechaRef],
    queryFn: async () => apiGet<Semana>(`/agenda/semana?sucursalId=${sucursalId}${fechaRef ? `&fecha=${fechaRef}` : ''}`),
    enabled: !!sucursalId,
    placeholderData: (previo) => previo,
  });

  const personas = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const t of data?.turnos ?? []) mapa.set(t.staffId, t.staffNombre);
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const guardar = useMutation({
    mutationFn: async (e: Edicion) => {
      const cuerpo = {
        fecha: e.fecha,
        horaEntrada: e.horaEntrada,
        horaSalida: e.horaSalida,
        estado: e.estado,
        motivoAusencia: e.estado === 'AUSENTE' ? e.motivoAusencia.trim() || undefined : undefined,
      };
      return e.id ? apiPatch(`/turnos/${e.id}`, cuerpo) : apiPost('/turnos', { ...cuerpo, staffId: e.staffId, sucursalId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda'] });
      queryClient.invalidateQueries({ queryKey: ['jornadas'] });
      toast({ title: 'Jornada guardada', variant: 'success' });
      setEdicion(null);
    },
    onError: (err: Error) => toast({ title: 'No se pudo guardar', description: err.message, variant: 'destructive' }),
  });

  if (!sucursalId) return <p className="text-sm text-slate-500">Elige una sucursal en la barra superior.</p>;
  if (error) return <p className="text-sm text-rose-600">{(error as Error).message}</p>;
  if (isLoading || !data) {
    return <div className="h-40 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />;
  }

  const puedeEditar = hasPermission('turnos:actualizar');
  const abrir = (t: TurnoSemana) =>
    puedeEditar &&
    setEdicion({ id: t.id, staffId: t.staffId, fecha: t.fecha, horaEntrada: hhmm(t.inicio), horaSalida: hhmm(t.fin), estado: t.estado, motivoAusencia: '' });
  const nuevaExtra = () =>
    setEdicion({ id: null, staffId: '', fecha: data.hoy >= data.dias[0] && data.hoy <= data.dias[6] ? data.hoy : data.dias[0], horaEntrada: '08:00', horaSalida: '12:00', estado: 'PROGRAMADO', motivoAusencia: '' });
  const horasValidas = !!edicion && edicion.horaSalida > edicion.horaEntrada;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Semana anterior" onClick={() => setFechaRef(sumarDias(data.dias[0], -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold text-slate-900 dark:text-white">
            {fechaCorta(data.dias[0])} – {fechaCorta(data.dias[6])}
          </span>
          <Button variant="ghost" size="icon" aria-label="Semana siguiente" onClick={() => setFechaRef(sumarDias(data.dias[0], 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {fechaRef && (
            <Button variant="ghost" size="sm" onClick={() => setFechaRef(null)}>Esta semana</Button>
          )}
        </div>
        <Protect permission="turnos:crear">
          <Button size="sm" variant="outline" onClick={nuevaExtra}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Jornada extra
          </Button>
        </Protect>
      </div>

      {personas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Nadie tiene jornadas esta semana en esta sucursal.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Persona</th>
                {data.dias.map((dia) => {
                  const d = new Date(`${dia}T00:00:00Z`);
                  return (
                    <th key={dia} className={`px-2 py-2 text-center text-xs font-semibold ${dia === data.hoy ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}>
                      <span className="capitalize">{d.toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' })}</span> {d.getUTCDate()}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {personas.map(([staffId, nombre]) => (
                <tr key={staffId}>
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-white whitespace-nowrap">{nombre}</td>
                  {data.dias.map((dia) => (
                    <td key={dia} className={`px-1 py-1.5 align-top ${dia === data.hoy ? 'bg-indigo-50/40 dark:bg-indigo-500/5' : ''}`}>
                      <div className="flex flex-col gap-1">
                        {data.turnos
                          .filter((t) => t.staffId === staffId && t.fecha === dia)
                          .map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => abrir(t)}
                              disabled={!puedeEditar}
                              title={ESTADOS.find((e) => e.valor === t.estado)?.etiqueta}
                              className={`rounded-md px-1.5 py-1 text-[11px] font-medium tabular-nums ${ESTILO_ESTADO[t.estado] ?? ESTILO_ESTADO.PROGRAMADO} ${puedeEditar ? 'hover:ring-2 hover:ring-indigo-300' : 'cursor-default'}`}
                            >
                              {hhmm(t.inicio)}–{hhmm(t.fin)}
                            </button>
                          ))}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Los cambios de acá valen solo para ese día. Para cambiar el horario de todas las semanas, edita a la persona en Equipo.
      </p>

      <Dialog open={!!edicion} onOpenChange={(a) => !a && setEdicion(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{edicion?.id ? 'Cambiar solo este día' : 'Jornada extra'}</DialogTitle>
            <DialogDescription>
              {edicion?.id
                ? `${personas.find(([id]) => id === edicion.staffId)?.[1] ?? ''} · ${edicion ? fechaCorta(edicion.fecha) : ''}`
                : 'Un día de trabajo fuera del horario habitual.'}
            </DialogDescription>
          </DialogHeader>
          {edicion && (
            <div className="space-y-3">
              {!edicion.id && (
                <>
                  <div className="space-y-1.5">
                    <label htmlFor="jor-persona" className="text-sm font-medium">Persona</label>
                    <select id="jor-persona" value={edicion.staffId} onChange={(e) => setEdicion({ ...edicion, staffId: e.target.value })} className={inputClass}>
                      <option value="">Elige a alguien del equipo</option>
                      {equipo.map((s) => <option key={s.id} value={s.id}>{s.usuario?.nombreCompleto ?? 'Sin nombre'}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="jor-fecha" className="text-sm font-medium">Fecha</label>
                    <input id="jor-fecha" type="date" value={edicion.fecha} onChange={(e) => setEdicion({ ...edicion, fecha: e.target.value })} className={inputClass} />
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="jor-entrada" className="text-sm font-medium">Entrada</label>
                  <input id="jor-entrada" type="time" value={edicion.horaEntrada} onChange={(e) => setEdicion({ ...edicion, horaEntrada: e.target.value })} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="jor-salida" className="text-sm font-medium">Salida</label>
                  <input id="jor-salida" type="time" value={edicion.horaSalida} onChange={(e) => setEdicion({ ...edicion, horaSalida: e.target.value })} className={inputClass} />
                </div>
              </div>
              {!horasValidas && <p className="text-xs text-rose-600">La salida debe ser posterior a la entrada.</p>}
              {edicion.id && (
                <div className="space-y-1.5">
                  <label htmlFor="jor-estado" className="text-sm font-medium">Estado</label>
                  <select id="jor-estado" value={edicion.estado} onChange={(e) => setEdicion({ ...edicion, estado: e.target.value })} className={inputClass}>
                    {ESTADOS.map((e) => <option key={e.valor} value={e.valor}>{e.etiqueta}</option>)}
                  </select>
                </div>
              )}
              {edicion.estado === 'AUSENTE' && (
                <input
                  type="text"
                  value={edicion.motivoAusencia}
                  onChange={(e) => setEdicion({ ...edicion, motivoAusencia: e.target.value })}
                  placeholder="Motivo (opcional)"
                  aria-label="Motivo de la ausencia"
                  className={inputClass}
                />
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdicion(null)}>Cancelar</Button>
            <Button onClick={() => edicion && guardar.mutate(edicion)} disabled={!edicion || !horasValidas || (!edicion.id && !edicion.staffId) || guardar.isPending}>
              {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
