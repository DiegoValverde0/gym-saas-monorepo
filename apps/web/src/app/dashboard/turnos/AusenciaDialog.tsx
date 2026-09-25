"use client";

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiPost } from '@/lib/api-client';
import { AlertTriangle, CalendarX } from 'lucide-react';
import { ClaseAfectada, MOTIVOS_AUSENCIA, StaffBasico, fechaCorta, inputClass } from './compartido';

interface VistaPrevia {
  persona: string;
  diasAfectados: number;
  jornadasYaTrabajadas: number;
  clases: ClaseAfectada[];
}

interface Resultado {
  diasAfectados: number;
  clasesReasignadas: ClaseAfectada[];
  clasesSinReemplazo: ClaseAfectada[];
}

/**
 * "Registrar ausencia" (plan 7.2 c): un solo formulario para un rango de
 * fechas. Antes de confirmar muestra cuántos días se marcan y qué clases de
 * la persona quedan sin instructor, con la opción de pasarlas a un reemplazo.
 */
export function AusenciaDialog({
  abierto,
  onClose,
  hoy,
  equipo,
  staffIdInicial,
}: {
  abierto: boolean;
  onClose: () => void;
  hoy: string;
  equipo: StaffBasico[];
  staffIdInicial?: string | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [staffId, setStaffId] = useState('');
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [motivo, setMotivo] = useState<string>('VACACIONES');
  const [nota, setNota] = useState('');
  const [reemplazoId, setReemplazoId] = useState('');

  useEffect(() => {
    if (!abierto) return;
    setStaffId(staffIdInicial ?? '');
    setDesde(hoy);
    setHasta(hoy);
    setMotivo('VACACIONES');
    setNota('');
    setReemplazoId('');
  }, [abierto, hoy, staffIdInicial]);

  const rangoValido = !!desde && !!hasta && hasta >= desde;
  const { data: previa, isFetching, error } = useQuery({
    queryKey: ['ausencia-vista-previa', staffId, desde, hasta],
    queryFn: async () => apiPost<VistaPrevia>('/turnos/ausencias/vista-previa', { staffId, desde, hasta, motivo: 'OTRO' }),
    enabled: abierto && !!staffId && rangoValido,
    retry: false,
  });

  const registrar = useMutation({
    mutationFn: async () =>
      apiPost<Resultado>('/turnos/ausencias', {
        staffId,
        desde,
        hasta,
        motivo,
        nota: nota.trim() || undefined,
        reemplazoStaffId: reemplazoId || undefined,
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['jornadas'] });
      queryClient.invalidateQueries({ queryKey: ['agenda'] });
      queryClient.invalidateQueries({ queryKey: ['clases'] });
      const partes = [`${r.diasAfectados} ${r.diasAfectados === 1 ? 'día registrado' : 'días registrados'} como ausencia.`];
      if (r.clasesReasignadas.length) partes.push(`${r.clasesReasignadas.length} ${r.clasesReasignadas.length === 1 ? 'clase pasó' : 'clases pasaron'} al reemplazo.`);
      const conChoque = r.clasesSinReemplazo.filter((c) => c.motivo);
      if (conChoque.length) partes.push(`No se pudo reasignar: ${conChoque.map((c) => `${c.nombreClase} ${fechaCorta(c.fecha)} (${c.motivo})`).join('; ')}`);
      else if (r.clasesSinReemplazo.length) partes.push(`${r.clasesSinReemplazo.length} ${r.clasesSinReemplazo.length === 1 ? 'clase queda' : 'clases quedan'} sin instructor: la ves en Agenda.`);
      toast({ title: 'Ausencia registrada', description: partes.join(' '), variant: conChoque.length ? 'default' : 'success' });
      onClose();
    },
    onError: (err: Error) => toast({ title: 'No se pudo registrar', description: err.message, variant: 'destructive' }),
  });

  const nombre = (s: StaffBasico) => s.usuario?.nombreCompleto ?? 'Sin nombre';
  const primerNombre = previa?.persona.split(' ')[0] ?? 'La persona';
  const sinJornadas = !!previa && previa.diasAfectados === 0;

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Registrar ausencia</DialogTitle>
          <DialogDescription>Vacaciones, enfermedad o un permiso: marca todos los días de una vez.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="aus-persona" className="text-sm font-medium">Persona</label>
            <select id="aus-persona" value={staffId} onChange={(e) => setStaffId(e.target.value)} className={inputClass}>
              <option value="">Elige a alguien del equipo</option>
              {equipo.map((s) => <option key={s.id} value={s.id}>{nombre(s)}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="aus-desde" className="text-sm font-medium">Desde</label>
              <input
                id="aus-desde"
                type="date"
                value={desde}
                onChange={(e) => {
                  setDesde(e.target.value);
                  if (e.target.value > hasta) setHasta(e.target.value);
                }}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="aus-hasta" className="text-sm font-medium">Hasta (incluido)</label>
              <input id="aus-hasta" type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Motivo</p>
            <div className="flex flex-wrap gap-2">
              {MOTIVOS_AUSENCIA.map((m) => (
                <button
                  key={m.valor}
                  type="button"
                  onClick={() => setMotivo(m.valor)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    motivo === m.valor
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                      : 'border-zinc-200 text-zinc-700 hover:border-indigo-400 dark:border-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  {m.etiqueta}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={200}
              placeholder="Nota (opcional)"
              aria-label="Nota"
              className={inputClass}
            />
          </div>

          {/* Impacto antes de confirmar */}
          {staffId && rangoValido && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3 text-sm space-y-2">
              {isFetching && !previa ? (
                <p className="text-slate-500">Revisando sus jornadas…</p>
              ) : error ? (
                <p className="text-rose-600">{(error as Error).message}</p>
              ) : previa ? (
                <>
                  {sinJornadas ? (
                    <p className="text-slate-600 dark:text-slate-300">
                      {previa.jornadasYaTrabajadas > 0
                        ? `${primerNombre} ya marcó su entrada en esas fechas: no hay nada que registrar.`
                        : `${primerNombre} no trabaja en esas fechas según su horario. No hace falta registrar nada.`}
                    </p>
                  ) : (
                    <p className="text-slate-700 dark:text-slate-200">
                      <CalendarX className="inline h-4 w-4 mr-1 -mt-0.5 text-slate-400" />
                      {primerNombre} no viene <strong>{previa.diasAfectados} {previa.diasAfectados === 1 ? 'día' : 'días'}</strong> de trabajo.
                    </p>
                  )}
                  {previa.clases.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-amber-700 dark:text-amber-300 font-medium">
                        <AlertTriangle className="inline h-4 w-4 mr-1 -mt-0.5" />
                        Tiene {previa.clases.length} {previa.clases.length === 1 ? 'clase' : 'clases'} en esas fechas:
                      </p>
                      <ul className="max-h-28 overflow-y-auto text-xs text-slate-600 dark:text-slate-300 space-y-0.5 pl-5 list-disc">
                        {previa.clases.map((c) => (
                          <li key={c.id}>{c.nombreClase} · {fechaCorta(c.fecha)} {c.hora} · {c.sucursal}</li>
                        ))}
                      </ul>
                      <div className="space-y-1">
                        <label htmlFor="aus-reemplazo" className="text-xs font-medium text-slate-700 dark:text-slate-300">¿Quién las da?</label>
                        <select id="aus-reemplazo" value={reemplazoId} onChange={(e) => setReemplazoId(e.target.value)} className={inputClass}>
                          <option value="">Nadie por ahora (quedan sin instructor)</option>
                          {equipo.filter((s) => s.id !== staffId).map((s) => <option key={s.id} value={s.id}>{nombre(s)}</option>)}
                        </select>
                        {reemplazoId && (
                          <p className="text-xs text-slate-500">Si al reemplazo le choca alguna con otra clase suya, esa queda como está y te avisamos.</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => registrar.mutate()} disabled={!previa || sinJornadas || isFetching || registrar.isPending}>
            {registrar.isPending ? 'Guardando…' : 'Registrar ausencia'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
