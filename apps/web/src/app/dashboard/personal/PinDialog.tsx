"use client";

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { apiDelete, apiPost } from '@/lib/api-client';
import { Shuffle } from 'lucide-react';

const pinAlAzar = () => String(Math.floor(1000 + Math.random() * 9000));

/**
 * PIN de marcaje (fase 6, DB-4): con él, la persona marca su entrada y su
 * salida en la tablet de recepción sin iniciar sesión. Se muestra solo al
 * asignarlo; después el sistema guarda únicamente el hash.
 */
export function PinDialog({ persona, onClose }: { persona: { id: string; nombre: string; tienePin: boolean } | null; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (persona) setPin(pinAlAzar());
  }, [persona]);

  const valido = /^\d{4,6}$/.test(pin);
  const guardar = useMutation({
    mutationFn: async () => apiPost(`/personal/${persona?.id}/pin`, { pin }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal'] });
      toast({ title: 'PIN guardado', description: `Dale a ${persona?.nombre} su PIN: ${pin}. Después no se vuelve a mostrar.`, variant: 'success' });
      onClose();
    },
    onError: (err: Error) => toast({ title: 'No se pudo guardar el PIN', description: err.message, variant: 'destructive' }),
  });
  const quitar = useMutation({
    mutationFn: async () => apiDelete(`/personal/${persona?.id}/pin`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal'] });
      toast({ title: 'PIN quitado' });
      onClose();
    },
    onError: (err: Error) => toast({ title: 'No se pudo quitar el PIN', description: err.message, variant: 'destructive' }),
  });

  return (
    <Dialog open={!!persona} onOpenChange={(a) => !a && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>PIN de marcaje de {persona?.nombre}</DialogTitle>
          <DialogDescription>
            Con este PIN marca su entrada y su salida en la tablet de recepción (Jornadas → Tablet de marcaje).
            {persona?.tienePin ? ' Ya tiene uno: guardar uno nuevo lo reemplaza.' : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            aria-label="PIN de 4 a 6 números"
            className="text-center text-2xl font-bold tracking-[0.4em] h-14"
          />
          <Button type="button" variant="outline" size="icon" className="h-14 w-14" onClick={() => setPin(pinAlAzar())} aria-label="Generar otro PIN">
            <Shuffle className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-slate-500">De 4 a 6 números. No puede repetirse con el de otra persona del equipo.</p>
        <DialogFooter className="gap-2 sm:justify-between">
          {persona?.tienePin ? (
            <Button variant="ghost" className="text-rose-600" onClick={() => quitar.mutate()} disabled={quitar.isPending}>Quitar PIN</Button>
          ) : <span />}
          <Button onClick={() => guardar.mutate()} disabled={!valido || guardar.isPending}>{guardar.isPending ? 'Guardando…' : 'Guardar PIN'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
