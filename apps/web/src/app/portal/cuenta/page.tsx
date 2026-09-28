"use client";

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPut } from '@/lib/api-client';
import { bs, NOMBRE_PAGO } from '@/lib/formato';
import { LogOut } from 'lucide-react';
import { fechaDia, Historial, NOMBRE_ESTADO_MEMBRESIA, useYo } from '../datos';

function CambiarContrasena() {
  const { toast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const error = repetida && nueva !== repetida ? 'Las contraseñas nuevas no coinciden.' : nueva && nueva.length < 8 ? 'Usa al menos 8 caracteres.' : null;

  const guardar = useMutation({
    mutationFn: () => apiPut('/portal/contrasena', { actual, nueva }),
    onSuccess: () => {
      toast({ title: 'Contraseña cambiada', variant: 'success' });
      setAbierto(false);
      setActual('');
      setNueva('');
      setRepetida('');
    },
    onError: (err: Error) => toast({ title: 'No se pudo cambiar', description: err.message, variant: 'destructive' }),
  });

  if (!abierto) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setAbierto(true)}>
        Cambiar contraseña
      </Button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      onSubmit={(e) => {
        e.preventDefault();
        guardar.mutate();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="actual">Contraseña actual</Label>
        <Input id="actual" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nueva">Contraseña nueva</Label>
        <Input id="nueva" type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="repetida">Repite la contraseña nueva</Label>
        <Input id="repetida" type="password" autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} required />
      </div>
      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={guardar.isPending || !!error || !actual || !nueva || !repetida}>
          Guardar
        </Button>
        <Button type="button" variant="ghost" className="dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export default function CuentaPortal() {
  const { logout } = useAuth();
  const { data: yo } = useYo();
  const { data: historial } = useQuery({ queryKey: ['portal-membresias'], queryFn: () => apiGet<Historial>('/portal/membresias') });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{yo?.nombre ?? 'Mi cuenta'}</h1>
        {yo?.correo && <p className="text-sm text-slate-600 dark:text-slate-400">{yo.correo}</p>}
      </div>

      <CambiarContrasena />

      <section className="space-y-2">
        <h2 className="font-semibold">Tus membresías</h2>
        {!historial ? (
          <div className="h-24 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        ) : historial.membresias.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">Todavía no tienes membresías.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {historial.membresias.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.planNombre}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {fechaDia(m.fechaInicio, { day: 'numeric', month: 'short' })}
                    {m.fechaFin ? ` – ${fechaDia(m.fechaFin, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-sm text-slate-600 dark:text-slate-300">{NOMBRE_ESTADO_MEMBRESIA[m.estado] ?? m.estado}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {historial && historial.pagos.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Tus pagos</h2>
          <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {historial.pagos.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.concepto}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {new Date(p.fechaHora).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {p.formasPago.length > 0 && ` · ${p.formasPago.map((f) => NOMBRE_PAGO[f] ?? f).join(' + ')}`}
                  </p>
                </div>
                <span className="shrink-0 font-medium">{bs(p.monto)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Button variant="ghost" className="w-full text-rose-600 dark:text-rose-400 dark:hover:bg-slate-800" onClick={logout}>
        <LogOut className="mr-1.5 h-4 w-4" /> Cerrar sesión
      </Button>
    </div>
  );
}
