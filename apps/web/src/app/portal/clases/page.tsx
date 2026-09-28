"use client";

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api-client';
import { Check, Clock, MapPin, User } from 'lucide-react';
import { CLAVE_CLASES, ClasePortal, diaLargo, hora, useAccionesClase } from '../datos';

// El botón "ghost" no trae colores para el modo oscuro.
const FANTASMA = 'dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white';

function BotonClase({ c }: { c: ClasePortal }) {
  const { reservar, cancelar } = useAccionesClase();
  const [confirmar, setConfirmar] = useState(false);
  const ocupado = reservar.isPending || cancelar.isPending;
  const mia = c.miReserva;

  if (mia && (mia.estado === 'CONFIRMADA' || mia.estado === 'EN_ESPERA')) {
    const enEspera = mia.estado === 'EN_ESPERA';
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`flex items-center gap-1 text-sm font-medium ${enEspera ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {enEspera ? (
            mia.posicionEspera === 1 ? 'Eres el primero en la lista de espera' : `Estás en la lista de espera (puesto ${mia.posicionEspera})`
          ) : (
            <>
              <Check className="h-4 w-4" /> Tienes tu lugar
            </>
          )}
        </p>
        {confirmar ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="destructive" disabled={ocupado} onClick={() => cancelar.mutate(mia.id, { onSettled: () => setConfirmar(false) })}>
              Sí, {enEspera ? 'salir' : 'cancelar'}
            </Button>
            <Button size="sm" variant="ghost" className={FANTASMA} onClick={() => setConfirmar(false)}>
              No
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className={FANTASMA} onClick={() => setConfirmar(true)}>
            {enEspera ? 'Salir de la lista' : 'Cancelar'}
          </Button>
        )}
      </div>
    );
  }

  if (!c.puedeReservar) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{c.motivo}</p>;
  }

  const llena = c.cuposLibres === 0;
  return (
    <Button
      className="w-full"
      variant={llena ? 'outline' : 'default'}
      disabled={ocupado}
      onClick={() => reservar.mutate({ claseId: c.id, listaEspera: llena })}
    >
      {llena ? 'Clase llena: anotarme en la lista de espera' : 'Reservar'}
    </Button>
  );
}

export default function ClasesPortal() {
  const { data: clases, isLoading, error } = useQuery({ queryKey: CLAVE_CLASES, queryFn: () => apiGet<ClasePortal[]>('/portal/clases') });
  const [sucursal, setSucursal] = useState<string | null>(null);

  const sucursales = useMemo(() => [...new Set((clases ?? []).map((c) => c.sucursal))].sort(), [clases]);
  const porDia = useMemo(() => {
    const grupos = new Map<string, ClasePortal[]>();
    for (const c of clases ?? []) {
      if (sucursal && c.sucursal !== sucursal) continue;
      const dia = diaLargo(c.fechaHora);
      grupos.set(dia, [...(grupos.get(dia) ?? []), c]);
    }
    return [...grupos.entries()];
  }, [clases, sucursal]);

  if (isLoading) return <div className="h-48 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />;
  if (error) return <p className="text-sm text-slate-600 dark:text-slate-400">{(error as Error).message}</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Clases</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Las de las próximas 2 semanas.</p>
      </div>

      {sucursales.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {[null, ...sucursales].map((s) => (
            <button
              key={s ?? 'todas'}
              onClick={() => setSucursal(s)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
                sucursal === s
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              {s ?? 'Todas las sedes'}
            </button>
          ))}
        </div>
      )}

      {porDia.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
          No hay clases programadas por ahora.
        </div>
      ) : (
        porDia.map(([dia, lista]) => (
          <section key={dia} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{dia}</h2>
            <ul className="space-y-2">
              {lista.map((c) => (
                <li key={c.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{c.nombre}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
                        <Clock className="h-3.5 w-3.5" /> {hora(c.fechaHora)} · {c.duracionMinutos} min
                      </p>
                      <p className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                        <MapPin className="h-3.5 w-3.5" /> {c.sucursal}
                        {c.sala ? ` · ${c.sala}` : ''}
                      </p>
                      {c.instructor && (
                        <p className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                          <User className="h-3.5 w-3.5" /> {c.instructor}
                        </p>
                      )}
                    </div>
                    <p className={`shrink-0 text-right text-sm font-medium ${c.cuposLibres === 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-300'}`}>
                      {c.cuposLibres === 0 ? 'Llena' : c.cuposLibres === 1 ? 'Queda 1 lugar' : `${c.cuposLibres} lugares`}
                    </p>
                  </div>
                  <BotonClase c={c} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
