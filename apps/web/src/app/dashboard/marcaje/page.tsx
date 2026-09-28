"use client";

import { useCallback, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { Protect } from '@/components/ui/protect';
import { apiPost } from '@/lib/api-client';
import { Delete, LogIn, LogOut } from 'lucide-react';

interface Resultado { persona: string; accion: 'entrada' | 'salida'; hora: number; horario: string }

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'borrar', '0', 'ok'] as const;

/**
 * Tablet de marcaje (fase 6, DB-4): se deja abierta en recepción con la
 * sesión de quien atiende. Cada persona del equipo teclea su PIN y queda
 * marcada su entrada o, si ya entró, su salida.
 */
export default function MarcajePage() {
  const { token } = useAuth();
  const [pin, setPin] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string; detalle?: string; accion?: 'entrada' | 'salida' } | null>(null);

  const marcar = useMutation({
    mutationFn: async (valor: string) => apiPost<Resultado>('/turnos/marcar-con-pin', { pin: valor }),
    onSuccess: (r) =>
      setMensaje({
        tipo: 'ok',
        accion: r.accion,
        texto: r.accion === 'entrada' ? `¡Hola, ${r.persona}! Entrada marcada` : `¡Hasta luego, ${r.persona}! Salida marcada`,
        detalle: `${hhmm(r.hora)} · Tu jornada: ${r.horario}`,
      }),
    onError: (err: Error) => setMensaje({ tipo: 'error', texto: err.message }),
    onSettled: () => setPin(''),
  });

  const pulsar = useCallback(
    (tecla: string) => {
      if (marcar.isPending) return;
      setMensaje(null);
      if (tecla === 'borrar') setPin((p) => p.slice(0, -1));
      else if (tecla === 'ok') {
        if (pin.length >= 4) marcar.mutate(pin);
      } else setPin((p) => (p.length < 6 ? p + tecla : p));
    },
    [marcar, pin],
  );

  // También con el teclado físico.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) pulsar(e.key);
      else if (e.key === 'Backspace') pulsar('borrar');
      else if (e.key === 'Enter') pulsar('ok');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pulsar]);

  // El mensaje se borra solo para dejar la tablet lista para el siguiente.
  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(null), mensaje.tipo === 'ok' ? 5000 : 4000);
    return () => clearTimeout(t);
  }, [mensaje]);

  if (!token) return null;

  return (
    <Protect permission="asistencias:crear" fallbackType="redirect">
      <div className="mx-auto flex max-w-sm flex-col items-center gap-6 py-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Marca tu entrada o salida</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Escribe tu PIN y toca OK.</p>
        </div>

        <div className="flex h-14 items-center gap-3" aria-live="polite" aria-label={`${pin.length} números escritos`}>
          {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
            <span key={i} className={`h-4 w-4 rounded-full ${i < pin.length ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
          ))}
        </div>

        {/* Espacio fijo para el aviso: antes aparecía entre el PIN y el
            teclado y lo empujaba hacia abajo mientras la persona tecleaba. */}
        <div className="flex min-h-[8.5rem] w-full items-center">
        {mensaje && (
          <div
            role="status"
            className={`w-full rounded-xl p-4 text-center ${
              mensaje.tipo === 'ok'
                ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-100'
                : 'bg-rose-50 text-rose-900 dark:bg-rose-500/15 dark:text-rose-100'
            }`}
          >
            <p className="flex items-center justify-center gap-2 text-lg font-semibold">
              {mensaje.accion === 'entrada' && <LogIn className="h-5 w-5" />}
              {mensaje.accion === 'salida' && <LogOut className="h-5 w-5" />}
              {mensaje.texto}
            </p>
            {mensaje.detalle && <p className="mt-1 text-sm opacity-80">{mensaje.detalle}</p>}
          </div>
        )}
        </div>

        <div className="grid w-full grid-cols-3 gap-3">
          {TECLAS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => pulsar(t)}
              disabled={marcar.isPending || (t === 'ok' && pin.length < 4)}
              aria-label={t === 'borrar' ? 'Borrar' : t === 'ok' ? 'Marcar' : t}
              className={`flex h-16 items-center justify-center rounded-2xl text-2xl font-semibold transition-colors disabled:opacity-40 ${
                t === 'ok'
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800'
              }`}
            >
              {t === 'borrar' ? <Delete className="h-6 w-6" /> : t === 'ok' ? 'OK' : t}
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          ¿No tienes PIN? Pídelo a quien administra el equipo (Equipo → ícono #).
        </p>
      </div>
    </Protect>
  );
}
