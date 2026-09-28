"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPatch } from '@/lib/api-client';
import { UserCheck } from 'lucide-react';

export interface ClaseSinCobertura {
  id: string;
  nombreClase: string;
  fechaHora: string;
  duracionMinutos: number;
  disciplinaId: string | null;
  entrenadorId: string | null;
  entrenadorNombre: string | null;
}

interface OpcionInstructor {
  id: string;
  nombre: string;
  imparteDisciplina: boolean | null;
  disponible: boolean | null;
  ocupadoCon: string | null;
}

/**
 * "Asignar instructor" desde los huecos de cobertura de la Agenda (plan 9):
 * solo ofrece a quien trabaja a esa hora en la sucursal y no da otra clase
 * al mismo tiempo. Cambia el instructor de esa sesión, no de toda la serie.
 */
export function AsignarInstructorDialog({ clase: abierta, sucursalId, onClose }: { clase: ClaseSinCobertura | null; sucursalId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [elegido, setElegido] = useState('');
  // Mientras se cierra se sigue mostrando la última clase (si no, el contenido
  // cambia a "Nadie disponible" durante la animación de salida).
  const [clase, setClase] = useState(abierta);
  if (abierta && abierta !== clase) setClase(abierta);

  useEffect(() => setElegido(''), [clase?.id]);

  const { data: opciones, isLoading } = useQuery({
    queryKey: ['clases-entrenadores', 'agenda', clase?.id],
    queryFn: async () =>
      apiGet<OpcionInstructor[]>(
        `/clases/entrenadores?${new URLSearchParams({
          sucursalId,
          fechaHora: clase!.fechaHora,
          duracionMinutos: String(clase!.duracionMinutos),
          excluirClaseId: clase!.id,
          ...(clase!.disciplinaId ? { disciplinaId: clase!.disciplinaId } : {}),
        })}`,
      ),
    enabled: !!clase,
  });
  const disponibles = (opciones ?? []).filter((o) => o.disponible && !o.ocupadoCon && o.id !== clase?.entrenadorId);

  const asignar = useMutation({
    mutationFn: async () => apiPatch(`/clases/${clase!.id}`, { entrenadorId: elegido }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda'] });
      queryClient.invalidateQueries({ queryKey: ['clases'] });
      const nombre = disponibles.find((o) => o.id === elegido)?.nombre;
      toast({ title: 'Instructor asignado', description: `${nombre} da ${clase?.nombreClase} en esa fecha.`, variant: 'success' });
      onClose();
    },
    onError: (err: Error) => toast({ title: 'No se pudo asignar', description: err.message, variant: 'destructive' }),
  });

  const cuando = clase
    ? new Date(clase.fechaHora).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <Dialog open={!!abierta} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Asignar instructor</DialogTitle>
          <DialogDescription>
            {clase?.nombreClase} · {cuando}
            {clase?.entrenadorNombre ? ` · hoy la tiene ${clase.entrenadorNombre}, que no trabaja a esa hora` : ''}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Buscando quién está disponible…</p>
        ) : disponibles.length === 0 ? (
          <p className="rounded-lg bg-amber-50 dark:bg-amber-500/15 p-3 text-sm text-amber-800 dark:text-amber-200">
            Nadie del equipo trabaja a esa hora en esta sucursal sin tener otra clase. Revisa las jornadas en{' '}
            <Link href="/dashboard/turnos" className="font-semibold underline">Jornadas</Link> o cambia la hora desde la clase.
          </p>
        ) : (
          <div className="space-y-2" role="radiogroup" aria-label="Instructores disponibles">
            {disponibles.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={elegido === o.id}
                onClick={() => setElegido(o.id)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  elegido === o.id
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-500/20 dark:text-indigo-100'
                    : 'border-slate-200 hover:border-indigo-300 dark:border-slate-700'
                }`}
              >
                <span className="font-medium">{o.nombre}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {o.imparteDisciplina === true ? 'Da esta disciplina' : o.imparteDisciplina === false ? 'No da esta disciplina' : 'Trabaja a esa hora'}
                </span>
              </button>
            ))}
          </div>
        )}

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Solo cambia esta fecha. Para cambiar el instructor de todas las fechas,{' '}
          <Link href={`/dashboard/clases?clase=${clase?.id ?? ''}`} className="underline">abre la clase</Link>.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => asignar.mutate()} disabled={!elegido || asignar.isPending}>
            <UserCheck className="mr-2 h-4 w-4" /> Asignar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
