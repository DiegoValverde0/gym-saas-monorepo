"use client";

import { useState } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { CalendarPlus, Clock, MapPin } from 'lucide-react';
import { diaLargo, fechaDia, hora, MembresiaPortal, useAccionesClase, useYo, Yo } from './datos';

function TarjetaMembresia({ m, siguiente }: { m: MembresiaPortal | null; siguiente: Yo['siguiente'] }) {
  if (!m) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <p className="font-semibold">Todavía no tienes una membresía</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Pregunta en recepción por los planes.</p>
      </div>
    );
  }

  const activa = m.estado === 'ACTIVA';
  const porSesiones = m.tipoPlan === 'SESIONES';
  const porVencer = activa && m.diasRestantes != null && m.diasRestantes <= 7;
  const aviso: Record<string, string> = {
    EN_ESPERA: `Empieza el ${fechaDia(m.fechaInicio)}.`,
    CONGELADA: 'Tu membresía está en pausa. Cuando vuelvas, habla con recepción para reactivarla.',
    VENCIDA: m.fechaFin ? `Venció el ${fechaDia(m.fechaFin)}. Renuévala en recepción.` : 'Venció. Renuévala en recepción.',
    AGOTADA: 'Usaste todas tus sesiones. Renueva tu plan en recepción.',
    PENDIENTE_PAGO: 'Tiene un pago pendiente. Acércate a recepción para activarla.',
  };

  // Número grande: sesiones que quedan, o días que quedan.
  const numero = activa ? (porSesiones ? m.sesionesRestantes ?? 0 : m.diasRestantes) : null;
  const unidad = porSesiones ? (numero === 1 ? 'sesión' : 'sesiones') : numero === 1 ? 'día' : 'días';

  const colores = !activa
    ? m.estado === 'EN_ESPERA'
      ? 'border-indigo-200 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10'
      : 'border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'
    : porVencer
      ? 'border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'
      : 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10';

  return (
    <div className={`rounded-2xl border p-5 ${colores}`}>
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Tu plan</p>
      <p className="text-lg font-semibold">{m.planNombre}</p>
      {numero != null ? (
        <>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Te {numero === 1 ? 'queda' : 'quedan'}</p>
          <p className="text-4xl font-bold tracking-tight">
            {numero} <span className="text-lg font-semibold">{unidad}</span>
          </p>
          {m.fechaFin && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {m.diasRestantes === 0 ? 'Vence hoy' : `Vence el ${fechaDia(m.fechaFin)}`}
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{aviso[m.estado] ?? ''}</p>
      )}
      {porVencer && <p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-400">Está por vencer: renuévala en recepción.</p>}
      {siguiente && (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Ya tienes tu siguiente plan ({siguiente.planNombre}): empieza el {fechaDia(siguiente.fechaInicio)}.
        </p>
      )}
    </div>
  );
}

export default function InicioPortal() {
  const { data: yo, isLoading } = useYo();
  const { cancelar } = useAccionesClase();
  const [cancelando, setCancelando] = useState<string | null>(null);

  if (isLoading || !yo) return <div className="h-48 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Hola, {yo.nombre.split(' ')[0]}</h1>

      <TarjetaMembresia m={yo.membresia} siguiente={yo.siguiente} />

      {yo.clasesActivas && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Tus próximas clases</h2>
            {yo.proximasClases.length > 0 && (
              <Link href="/portal/clases" className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                Ver horario
              </Link>
            )}
          </div>

          {yo.proximasClases.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center dark:border-slate-700">
              <p className="text-sm text-slate-600 dark:text-slate-400">No tienes clases reservadas.</p>
              <Link href="/portal/clases" className={`${buttonVariants({ size: 'sm' })} mt-3`}>
                <CalendarPlus className="mr-1.5 h-4 w-4" /> Reservar una clase
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {yo.proximasClases.map((c) => (
                <li key={c.reservaId} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{c.nombre}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
                        <Clock className="h-3.5 w-3.5" /> {diaLargo(c.fechaHora)}, {hora(c.fechaHora)}
                      </p>
                      <p className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                        <MapPin className="h-3.5 w-3.5" /> {c.sucursal}
                      </p>
                      {c.estado === 'EN_ESPERA' && <p className="mt-1 text-sm font-medium text-amber-600 dark:text-amber-400">En lista de espera</p>}
                    </div>
                    {cancelando === c.reservaId ? (
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={cancelar.isPending}
                          onClick={() => cancelar.mutate(c.reservaId, { onSettled: () => setCancelando(null) })}
                        >
                          Sí, cancelar
                        </Button>
                        <button className="text-xs text-slate-500 dark:text-slate-400" onClick={() => setCancelando(null)}>
                          No
                        </button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" className="shrink-0 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white" onClick={() => setCancelando(c.reservaId)}>
                        Cancelar
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
