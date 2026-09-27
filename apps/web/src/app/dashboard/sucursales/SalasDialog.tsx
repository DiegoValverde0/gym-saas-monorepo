"use client";

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';

interface Sala { id: string; nombre: string; capacidad: number | null; _count?: { clasesPlantilla: number } }

/**
 * Salas de una sucursal (fase 6, DB-2). Con salas, dos clases no pueden usar
 * la misma sala a la misma hora; sin salas, todo funciona como antes.
 */
export function SalasDialog({ sucursal, onClose }: { sucursal: { id: string; nombre: string } | null; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [nueva, setNueva] = useState({ nombre: '', capacidad: '' });
  const [edicion, setEdicion] = useState<{ id: string; nombre: string; capacidad: string } | null>(null);

  const { data: salas = [], isLoading } = useQuery({
    queryKey: ['salas', sucursal?.id],
    queryFn: async () => apiGet<Sala[]>(`/salas?sucursalId=${sucursal?.id}`),
    enabled: !!sucursal,
  });
  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['salas'] });
  const error = (err: Error) => toast({ title: 'No se pudo guardar', description: err.message, variant: 'destructive' });
  const capacidad = (v: string) => (v.trim() ? Number(v) : null);

  const crear = useMutation({
    mutationFn: async () => apiPost('/salas', { sucursalId: sucursal?.id, nombre: nueva.nombre.trim(), capacidad: capacidad(nueva.capacidad) }),
    onSuccess: () => { refrescar(); setNueva({ nombre: '', capacidad: '' }); },
    onError: error,
  });
  const guardar = useMutation({
    mutationFn: async () => apiPatch(`/salas/${edicion?.id}`, { nombre: edicion?.nombre.trim(), capacidad: capacidad(edicion?.capacidad ?? '') }),
    onSuccess: () => { refrescar(); setEdicion(null); },
    onError: error,
  });
  const quitar = useMutation({
    mutationFn: async (id: string) => apiDelete<{ clasesSinSala: number }>(`/salas/${id}`),
    onSuccess: (r) => {
      refrescar();
      toast({ title: 'Sala quitada', description: r.clasesSinSala ? `${r.clasesSinSala} ${r.clasesSinSala === 1 ? 'clase quedó' : 'clases quedaron'} sin sala.` : undefined });
    },
    onError: error,
  });

  return (
    <Dialog open={!!sucursal} onOpenChange={(a) => !a && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Salas de {sucursal?.nombre}</DialogTitle>
          <DialogDescription>Opcional. Si cargas salas, el sistema no deja poner dos clases en la misma sala a la misma hora.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {isLoading ? (
            <div className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ) : salas.length === 0 ? (
            <p className="text-sm text-slate-500">Todavía no hay salas en esta sucursal.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
              {salas.map((s) =>
                edicion?.id === s.id ? (
                  <li key={s.id} className="flex items-center gap-2 p-2">
                    <Input value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} aria-label="Nombre de la sala" />
                    <Input type="number" min={1} value={edicion.capacidad} onChange={(e) => setEdicion({ ...edicion, capacidad: e.target.value })} placeholder="Cupo" aria-label="Cupo" className="w-20 shrink-0" />
                    <Button size="icon" variant="ghost" onClick={() => guardar.mutate()} disabled={!edicion.nombre.trim() || guardar.isPending} aria-label="Guardar"><Check className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setEdicion(null)} aria-label="Cancelar"><X className="h-4 w-4" /></Button>
                  </li>
                ) : (
                  <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{s.nombre}</p>
                      <p className="text-xs text-slate-500">
                        {s.capacidad ? `${s.capacidad} personas` : 'Sin cupo definido'} · {s._count?.clasesPlantilla ?? 0} {(s._count?.clasesPlantilla ?? 0) === 1 ? 'horario de clase' : 'horarios de clase'}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEdicion({ id: s.id, nombre: s.nombre, capacidad: s.capacidad ? String(s.capacidad) : '' })} aria-label={`Editar ${s.nombre}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="hover:text-rose-600" onClick={() => quitar.mutate(s.id)} disabled={quitar.isPending} aria-label={`Quitar ${s.nombre}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <Input value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Ej. Sala de spinning" aria-label="Nombre de la sala nueva" />
            <Input type="number" min={1} value={nueva.capacidad} onChange={(e) => setNueva({ ...nueva, capacidad: e.target.value })} placeholder="Cupo" aria-label="Cupo de la sala nueva" className="w-20 shrink-0" />
            <Button onClick={() => crear.mutate()} disabled={nueva.nombre.trim().length < 2 || crear.isPending}>
              <Plus className="h-4 w-4 mr-1" /> Agregar
            </Button>
          </div>
          <p className="text-xs text-slate-500">Quitar una sala no borra clases: las que la usaban quedan sin sala.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
