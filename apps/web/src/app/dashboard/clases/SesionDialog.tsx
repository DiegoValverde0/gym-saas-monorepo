"use client";

import { Ayuda } from '@/components/ui/ayuda';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Protect } from '@/components/ui/protect';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { apiGet, apiPatch, apiPost, unwrapList } from '@/lib/api-client';
import { CheckCircle, Search, UserX, X, Repeat, CalendarX } from 'lucide-react';
import { Clase, Cliente, OCUPA_CUPO, Reserva, SerieClase, dateInputClass, toDatetimeLocal } from './compartido';

const ESTADO_RESERVA: Record<string, { label: string; variant: 'success' | 'primary' | 'warning' | 'default' }> = {
  CONFIRMADA: { label: 'Confirmada', variant: 'primary' },
  ASISTIO: { label: 'Asistió', variant: 'success' },
  NO_ASISTIO: { label: 'No asistió', variant: 'warning' },
  CANCELADA: { label: 'Cancelada', variant: 'default' },
  EN_ESPERA: { label: 'En espera', variant: 'warning' },
};

interface Evaluacion { permitido: boolean; motivo: string | null }
interface OpcionEntrenador { id: string; nombre: string; imparteDisciplina: boolean | null; disponible: boolean | null }

/**
 * Al tocar una sesión en el calendario (plan de simplificación, 8.1), como en
 * Google Calendar:
 *  - Reservas: buscar cliente con semáforo (puede / no puede y por qué).
 *  - Solo esta sesión: cambiar la hora, asignar un reemplazo o cancelar esta fecha.
 *  - Toda la clase: editar o eliminar la serie completa.
 */
export function SesionDialog({
  claseId,
  onClose,
  serie,
  onEditarSerie,
  onEliminarSerie,
}: {
  claseId: string | null;
  onClose: () => void;
  serie: SerieClase | null;
  onEditarSerie: (serie: SerieClase) => void;
  onEliminarSerie: (serie: SerieClase) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [busqueda, setBusqueda] = useState('');
  const [candidato, setCandidato] = useState<Cliente | null>(null);
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [reemplazoId, setReemplazoId] = useState('');
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);

  const { data: clase, isLoading } = useQuery({
    queryKey: ['clase-detalle', claseId],
    queryFn: async () => apiGet<Clase>(`/clases/${claseId}`),
    enabled: !!claseId,
  });

  useEffect(() => {
    setBusqueda('');
    setCandidato(null);
    setConfirmarCancelar(false);
  }, [claseId]);
  useEffect(() => {
    if (clase) {
      setNuevaFecha(toDatetimeLocal(clase.fechaHora));
      setReemplazoId(clase.entrenadorId ?? '');
    }
  }, [clase]);

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['clase-detalle', claseId] });
    queryClient.invalidateQueries({ queryKey: ['clases'] });
    queryClient.invalidateQueries({ queryKey: ['agenda'] });
  };

  // ---- Reservas con semáforo
  const termino = busqueda.trim();
  const { data: resultados = [] } = useQuery({
    queryKey: ['clientes', 'reserva', termino],
    queryFn: async () => unwrapList<Cliente>(await apiGet(`/clientes?search=${encodeURIComponent(termino)}&limit=8`)),
    enabled: !!claseId && !candidato && termino.length >= 2,
  });
  const yaReservados = new Set((clase?.reservas ?? []).filter((r) => OCUPA_CUPO(r.estado) || r.estado === 'EN_ESPERA').map((r) => r.clienteId));
  // Lista de espera (fase 6, DB-3): las reservas vienen ordenadas por fecha de reserva.
  const enEspera = (clase?.reservas ?? []).filter((r) => r.estado === 'EN_ESPERA');
  const llena = !!clase && (clase.reservas ?? []).filter((r) => OCUPA_CUPO(r.estado)).length >= clase.capacidadMaxima;
  const { data: evaluacion, isFetching: evaluando } = useQuery({
    queryKey: ['puede-reservar', claseId, candidato?.id],
    queryFn: async () => apiGet<Evaluacion>(`/reservas/puede-reservar?claseId=${claseId}&clienteId=${candidato!.id}`),
    enabled: !!claseId && !!candidato,
  });

  const reservar = useMutation({
    mutationFn: async (forzar: boolean) =>
      apiPost<{ estado: string }>(forzar ? '/reservas/forzar' : '/reservas', { claseId, clienteId: candidato!.id, listaEspera: llena }),
    onSuccess: (r) => {
      refrescar();
      toast({
        title: r.estado === 'EN_ESPERA' ? 'Anotado en la lista de espera' : 'Reserva agregada',
        description: r.estado === 'EN_ESPERA' ? `${candidato?.nombre} sube solo si se libera un lugar.` : candidato?.nombre,
        variant: 'success',
      });
      setCandidato(null);
      setBusqueda('');
    },
    onError: (err: Error) => toast({ title: 'No se pudo reservar', description: err.message, variant: 'destructive' }),
  });
  const marcar = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: 'ASISTIO' | 'NO_ASISTIO' }) => apiPatch(`/reservas/${id}`, { estado }),
    onSuccess: refrescar,
    onError: (err: Error) => toast({ title: 'No se pudo marcar la asistencia', description: err.message, variant: 'destructive' }),
  });
  const cancelarReserva = useMutation({
    mutationFn: async (id: string) => apiPatch<{ promovidos?: string[] }>(`/reservas/${id}/cancelar`),
    onSuccess: (r) => {
      refrescar();
      toast({
        title: 'Reserva cancelada',
        description: r.promovidos?.length ? `Pasó de la lista de espera a la clase: ${r.promovidos.join(', ')}.` : undefined,
      });
    },
    onError: (err: Error) => toast({ title: 'No se pudo cancelar', description: err.message, variant: 'destructive' }),
  });

  // ---- Solo esta sesión
  const { data: entrenadores = [] } = useQuery({
    queryKey: ['clases-entrenadores', 'sesion', claseId, clase?.fechaHora],
    queryFn: async () =>
      apiGet<OpcionEntrenador[]>(
        `/clases/entrenadores?${new URLSearchParams({
          sucursalId: clase!.sucursalId!,
          fechaHora: clase!.fechaHora,
          duracionMinutos: String(clase!.duracionMinutos),
          ...(clase!.disciplinaId ? { disciplinaId: clase!.disciplinaId } : {}),
        })}`,
      ),
    enabled: !!clase?.sucursalId,
  });
  const guardarSesion = useMutation({
    mutationFn: async (cambios: Record<string, unknown>) => apiPatch(`/clases/${claseId}`, cambios),
    onSuccess: () => { refrescar(); toast({ title: 'Sesión actualizada', description: 'Solo cambió esta fecha; el resto de la clase sigue igual.', variant: 'success' }); },
    onError: (err: Error) => toast({ title: 'No se pudo guardar', description: err.message, variant: 'destructive' }),
  });
  const cancelarSesion = useMutation({
    mutationFn: async () => apiPost<{ reservasCanceladas: number }>(`/clases/${claseId}/cancelar`),
    onSuccess: (r) => {
      refrescar();
      setConfirmarCancelar(false);
      toast({ title: 'Sesión cancelada', description: r.reservasCanceladas ? `Se cancelaron ${r.reservasCanceladas} reservas.` : 'No tenía reservas.', variant: 'success' });
    },
    onError: (err: Error) => toast({ title: 'No se pudo cancelar', description: err.message, variant: 'destructive' }),
  });

  const reservasActivas = (clase?.reservas ?? []).filter((r) => OCUPA_CUPO(r.estado)).length;
  const cancelada = clase?.estado === 'INACTIVO';
  const fechaTexto = clase ? new Date(clase.fechaHora).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <Dialog open={!!claseId} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="sm:max-w-[580px]">
        <DialogHeader>
          <DialogTitle>{clase?.nombreClase ?? 'Clase'}</DialogTitle>
          <DialogDescription>
            {clase
              ? `${fechaTexto} · ${clase.entrenador?.usuario?.nombreCompleto ?? 'Sin instructor'}${clase.sala ? ` · ${clase.sala.nombre}` : ''} · ${reservasActivas}/${clase.capacidadMaxima} cupos${cancelada ? ' · CANCELADA' : ''}`
              : 'Cargando...'}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !clase ? (
          <p className="text-sm text-zinc-500 py-4">Cargando...</p>
        ) : (
          <Tabs defaultValue="reservas" className="w-full">
            <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 w-full">
              <TabsTrigger value="reservas" className="flex-1">Reservas</TabsTrigger>
              <Protect permission="clases:actualizar" fallbackType="hide">
                <TabsTrigger value="sesion" className="flex-1">Solo esta sesión</TabsTrigger>
              </Protect>
              {serie && (
                <Protect permission="clases:actualizar" fallbackType="hide">
                  <TabsTrigger value="serie" className="flex-1">Toda la clase</TabsTrigger>
                </Protect>
              )}
            </TabsList>

            {/* ---------------- Reservas ---------------- */}
            <TabsContent value="reservas" className="space-y-4 mt-4">
              {!cancelada && (
                <Protect permission="reservas:crear" fallbackType="hide">
                  {candidato ? (
                    <div className={`rounded-lg border p-3 space-y-2 ${evaluacion?.permitido === false ? 'border-rose-300 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-900/50' : 'border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-900/50'}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{candidato.nombre}</span>
                        <button type="button" onClick={() => setCandidato(null)} className="text-xs text-zinc-500 hover:underline">Cambiar</button>
                      </div>
                      {evaluando || !evaluacion ? (
                        <p className="text-xs text-zinc-500">Revisando si puede reservar...</p>
                      ) : evaluacion.permitido ? (
                        <>
                          {llena ? (
                            <>
                              <p className="text-sm text-amber-800 dark:text-amber-200">
                                La clase está llena{enEspera.length ? ` y hay ${enEspera.length} en espera` : ''}. Si alguien cancela, sube solo.
                              </p>
                              <Button size="sm" variant="outline" onClick={() => reservar.mutate(false)} disabled={reservar.isPending}>Anotar en lista de espera</Button>
                            </>
                          ) : (
                            <>
                              <p className="text-sm text-emerald-800 dark:text-emerald-200">Puede reservar esta clase.</p>
                              <Button size="sm" onClick={() => reservar.mutate(false)} disabled={reservar.isPending}>Reservar</Button>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">{evaluacion.motivo}</p>
                          {hasPermission('asistencias:forzar') && (
                            <Button size="sm" variant="outline" onClick={() => reservar.mutate(true)} disabled={reservar.isPending}>Reservar igual (bajo mi responsabilidad)</Button>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input placeholder="Buscar cliente para reservar..." className="pl-9" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
                      </div>
                      {termino.length >= 2 && (
                        <div className="divide-y border rounded-lg overflow-hidden bg-white dark:bg-slate-900 max-h-40 overflow-y-auto">
                          {resultados.filter((c) => !yaReservados.has(c.id)).length === 0 ? (
                            <div className="p-3 text-center text-xs text-zinc-500">Sin resultados</div>
                          ) : (
                            resultados.filter((c) => !yaReservados.has(c.id)).map((c) => (
                              <button key={c.id} onClick={() => setCandidato(c)} className="w-full text-left p-2.5 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-500/20">
                                {c.nombre} <span className="text-xs text-zinc-500">{c.numeroDocumento}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Protect>
              )}

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {(clase.reservas ?? []).length === 0 ? (
                  <p className="text-sm text-zinc-500 text-center py-6">Todavía no hay reservas.</p>
                ) : (
                  (clase.reservas as Reserva[]).map((r) => (
                    <div key={r.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{r.cliente?.nombre}</p>
                        <p className="text-xs text-slate-500">{r.cliente?.numeroDocumento}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={ESTADO_RESERVA[r.estado]?.variant ?? 'default'}>
                          {r.estado === 'EN_ESPERA' ? `En espera · ${enEspera.findIndex((e) => e.id === r.id) + 1}°` : ESTADO_RESERVA[r.estado]?.label ?? r.estado}
                        </Badge>
                        {r.estado !== 'CANCELADA' && r.estado !== 'EN_ESPERA' && (
                          <Protect permission="reservas:actualizar" fallbackType="hide">
                            <Button variant="ghost" size="icon" title="Asistió" className={`h-7 w-7 ${r.estado === 'ASISTIO' ? 'text-emerald-600' : 'text-slate-400 hover:text-emerald-600'}`} onClick={() => marcar.mutate({ id: r.id, estado: 'ASISTIO' })} disabled={marcar.isPending || r.estado === 'ASISTIO'}>
                              <CheckCircle className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" title="No asistió" className={`h-7 w-7 ${r.estado === 'NO_ASISTIO' ? 'text-amber-600' : 'text-slate-400 hover:text-amber-600'}`} onClick={() => marcar.mutate({ id: r.id, estado: 'NO_ASISTIO' })} disabled={marcar.isPending || r.estado === 'NO_ASISTIO'}>
                              <UserX className="h-3.5 w-3.5" />
                            </Button>
                          </Protect>
                        )}
                        {(r.estado === 'CONFIRMADA' || r.estado === 'EN_ESPERA') && (
                          <Protect permission="reservas:eliminar" fallbackType="hide">
                            <Button variant="ghost" size="icon" title={r.estado === 'EN_ESPERA' ? 'Quitar de la lista de espera' : 'Cancelar reserva'} className="h-7 w-7 text-slate-400 hover:text-rose-600" onClick={() => cancelarReserva.mutate(r.id)} disabled={cancelarReserva.isPending}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </Protect>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            {/* ---------------- Solo esta sesión ---------------- */}
            <TabsContent value="sesion" className="space-y-5 mt-4">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Los cambios de acá valen solo para esta fecha. <Ayuda tema="sesion" /></p>
              {cancelada ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-300">Esta sesión está cancelada.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="sesion-fecha">Cambiar la hora de esta fecha</label>
                    <div className="flex gap-2">
                      <input id="sesion-fecha" type="datetime-local" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} className={dateInputClass} />
                      <Button variant="outline" disabled={guardarSesion.isPending || !nuevaFecha || nuevaFecha === toDatetimeLocal(clase.fechaHora)} onClick={() => guardarSesion.mutate({ fechaHora: new Date(nuevaFecha).toISOString() })}>Guardar</Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="sesion-reemplazo">Instructor de esta fecha (reemplazo)</label>
                    <div className="flex gap-2">
                      <select id="sesion-reemplazo" value={reemplazoId} onChange={(e) => setReemplazoId(e.target.value)} className={dateInputClass}>
                        <option value="">Sin instructor</option>
                        {entrenadores.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.nombre}{e.disponible ? ' · trabaja a esa hora' : ''}{e.imparteDisciplina === false ? ' · no da esta disciplina' : ''}
                          </option>
                        ))}
                      </select>
                      <Button variant="outline" disabled={guardarSesion.isPending || reemplazoId === (clase.entrenadorId ?? '')} onClick={() => guardarSesion.mutate({ entrenadorId: reemplazoId || null })}>Guardar</Button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-rose-200 dark:border-rose-900/50 p-3 space-y-2">
                    {confirmarCancelar ? (
                      <>
                        <p className="text-sm text-rose-800 dark:text-rose-200">
                          {reservasActivas ? `Tiene ${reservasActivas} reservas: se cancelarán también.` : 'No tiene reservas.'} Las demás fechas de la clase siguen igual.
                        </p>
                        <div className="flex gap-2">
                          <Button variant="destructive" size="sm" onClick={() => cancelarSesion.mutate()} disabled={cancelarSesion.isPending}>Sí, cancelar esta fecha</Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmarCancelar(false)}>No</Button>
                        </div>
                      </>
                    ) : (
                      <Button variant="ghost" className="text-rose-700 dark:text-rose-300" onClick={() => setConfirmarCancelar(true)}>
                        <CalendarX className="w-4 h-4 mr-2" /> Cancelar solo esta fecha
                      </Button>
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            {/* ---------------- Toda la clase ---------------- */}
            {serie && (
              <TabsContent value="serie" className="space-y-3 mt-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  Cambia el horario, el instructor o el cupo de todas las fechas futuras. Las sesiones con reservas no se borran.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => onEditarSerie(serie)}><Repeat className="w-4 h-4 mr-2" /> Editar toda la clase</Button>
                  <Protect permission="clases:eliminar" fallbackType="hide">
                    <Button variant="ghost" className="text-rose-700 dark:text-rose-300" onClick={() => onEliminarSerie(serie)}>Dejar de programarla</Button>
                  </Protect>
                </div>
              </TabsContent>
            )}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
