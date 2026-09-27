"use client";

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useModoUso } from '@/hooks/use-modo-uso';
import { useModulosActivos } from '@/hooks/use-modulos-activos';
import { useSucursalActiva } from '@/hooks/use-sucursal-activa';
import { apiGet, apiPost } from '@/lib/api-client';
import { CheckCircle2, Delete, Hand, Lock, Loader2, XCircle } from 'lucide-react';

interface Resultado {
  resultado: 'BIENVENIDO' | 'YA_INGRESO' | 'RECHAZADO' | 'NO_ENCONTRADO';
  nombre?: string;
  mensaje?: string;
  sesionesRestantes?: number | null;
  venceEl?: string | null;
  clases?: string[];
}

interface Organizacion { nombre: string; configuracion?: { kiosco?: { tienePin?: boolean } } | null }

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'borrar', '0', 'ok'] as const;

const fechaLarga = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });

function detalle(r: Resultado): string | undefined {
  if (r.resultado !== 'BIENVENIDO') return r.mensaje;
  const partes = [];
  if (r.clases?.length) partes.push(`Tu clase: ${r.clases.join(', ')}`);
  if (r.sesionesRestantes != null) partes.push(r.sesionesRestantes === 1 ? 'Te queda 1 sesión' : `Te quedan ${r.sesionesRestantes} sesiones`);
  if (r.venceEl) partes.push(`Tu membresía vence el ${fechaLarga(r.venceEl)}`);
  return partes.join(' · ') || undefined;
}

/**
 * Modo kiosco de Control de acceso (plan 10.3): la tablet de la entrada queda
 * abierta con la sesión de quien atiende y el cliente marca su ingreso con su
 * documento. Fuera del panel (sin menú) y a pantalla completa; para salir se
 * pide el PIN del kiosco que define el administrador en Configuración.
 */
export default function KioscoPage() {
  const router = useRouter();
  const { token } = useAuth();
  const { hasPermission, isPending: cargandoPermisos } = usePermissions();
  const { alMenos } = useModoUso();
  const modulos = useModulosActivos();
  const { sucursalId, sucursal } = useSucursalActiva();

  const [empezado, setEmpezado] = useState(false);
  const [documento, setDocumento] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saliendo, setSaliendo] = useState(false);
  const [pin, setPin] = useState('');
  const [errorPin, setErrorPin] = useState<string | null>(null);

  const { data: org } = useQuery({
    queryKey: ['organizacion'],
    queryFn: async () => apiGet<Organizacion>('/organizaciones/me/info'),
    enabled: !!token,
  });
  const tienePin = !!org?.configuracion?.kiosco?.tienePin;
  const disponible = hasPermission('asistencias:crear') && modulos.controlAcceso && alMenos('intermedio') && !!sucursalId;

  const ingresar = useMutation({
    mutationFn: async (doc: string) => apiPost<Resultado>('/asistencias/kiosco/ingreso', { documento: doc, sucursalId }),
    onSuccess: (r) => setResultado(r),
    onError: (err: Error) => setError(err.message),
    onSettled: () => setDocumento(''),
  });

  const volverAlPanel = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    router.push('/dashboard/asistencias');
  }, [router]);

  const salir = useMutation({
    mutationFn: async (valor: string) => apiPost('/asistencias/kiosco/salir', { pin: valor }),
    onSuccess: volverAlPanel,
    onError: (err: Error) => { setErrorPin(err.message); setPin(''); },
  });

  const empezar = () => {
    setEmpezado(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const pedirSalida = () => {
    if (!tienePin) return volverAlPanel();
    setSaliendo(true);
    setPin('');
    setErrorPin(null);
  };

  const pulsar = useCallback(
    (tecla: string) => {
      if (saliendo) {
        if (salir.isPending) return;
        setErrorPin(null);
        if (tecla === 'borrar') setPin((p) => p.slice(0, -1));
        else if (tecla === 'ok') { if (pin.length >= 4) salir.mutate(pin); }
        else if (/^\d$/.test(tecla)) setPin((p) => (p.length < 6 ? p + tecla : p));
        return;
      }
      if (ingresar.isPending || resultado) return;
      setError(null);
      if (tecla === 'borrar') setDocumento((d) => d.slice(0, -1));
      else if (tecla === 'ok') { if (documento.trim().length >= 3) ingresar.mutate(documento.trim()); }
      else if (/^[0-9a-zA-Z-]$/.test(tecla)) setDocumento((d) => (d.length < 20 ? d + tecla.toUpperCase() : d));
    },
    [saliendo, salir, pin, ingresar, resultado, documento],
  );

  // También con el teclado físico (un documento puede llevar letras).
  useEffect(() => {
    if (!empezado) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') pulsar('borrar');
      else if (e.key === 'Enter') pulsar('ok');
      else if (e.key === 'Escape' && saliendo) setSaliendo(false);
      else if (e.key.length === 1) pulsar(e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [empezado, pulsar, saliendo]);

  // El resultado se borra solo para dejar la tablet lista para el siguiente.
  useEffect(() => {
    if (!resultado && !error) return;
    const t = setTimeout(() => { setResultado(null); setError(null); }, resultado?.resultado === 'BIENVENIDO' ? 4000 : 6000);
    return () => clearTimeout(t);
  }, [resultado, error]);

  // El botón "atrás" del navegador no saca del kiosco.
  useEffect(() => {
    if (!empezado) return;
    history.pushState(null, '', location.href);
    const onPop = () => history.pushState(null, '', location.href);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [empezado]);

  if (!token || cargandoPermisos) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  if (!disponible) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-center text-white">
        <div className="max-w-md space-y-4">
          <h1 className="text-2xl font-bold">El modo kiosco no está disponible</h1>
          <p className="text-slate-300">
            Necesita el módulo de Control de acceso, el modo intermedio o experto, una sucursal elegida y permiso para registrar ingresos.
          </p>
          <button type="button" onClick={() => router.push('/dashboard')} className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold hover:bg-indigo-700">
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  if (!empezado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="max-w-md space-y-5 text-center">
          <h1 className="text-3xl font-bold">Modo kiosco</h1>
          <p className="text-slate-300">
            Deja esta tablet en la entrada de <strong>{sucursal?.nombre ?? 'tu sucursal'}</strong>. Cada cliente escribe su número de documento
            y el ingreso queda registrado a tu nombre.
          </p>
          {!tienePin && (
            <p className="rounded-lg bg-amber-500/15 p-3 text-sm text-amber-200">
              No hay PIN de salida: cualquiera podrá salir del kiosco. Quien administra el gimnasio lo define en Configuración → Reglas.
            </p>
          )}
          <div className="flex justify-center gap-3">
            <button type="button" onClick={() => router.push('/dashboard/asistencias')} className="rounded-lg border border-slate-700 px-4 py-2 font-semibold hover:bg-slate-900">
              Cancelar
            </button>
            <button type="button" onClick={empezar} className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold hover:bg-indigo-700">
              Empezar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tono =
    error || resultado?.resultado === 'RECHAZADO' || resultado?.resultado === 'NO_ENCONTRADO'
      ? 'rojo'
      : resultado?.resultado === 'YA_INGRESO'
        ? 'ambar'
        : resultado
          ? 'verde'
          : null;
  const valor = saliendo ? pin : documento;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-950 p-6 text-white select-none">
      <button
        type="button"
        onClick={pedirSalida}
        aria-label="Salir del kiosco"
        className="absolute right-4 top-4 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-slate-900 hover:text-slate-300"
      >
        <Lock className="h-3.5 w-3.5" /> Salir
      </button>

      <div className="text-center">
        <p className="text-sm uppercase tracking-widest text-slate-400">{org?.nombre}{sucursal ? ` · ${sucursal.nombre}` : ''}</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{saliendo ? 'PIN para salir del kiosco' : 'Escribe tu número de documento'}</h1>
      </div>

      {tono && !saliendo ? (
        <div
          role="status"
          className={`flex w-full max-w-md flex-col items-center gap-3 rounded-3xl p-8 text-center ${
            tono === 'verde' ? 'bg-emerald-600' : tono === 'ambar' ? 'bg-amber-500 text-slate-950' : 'bg-rose-600'
          }`}
        >
          {tono === 'verde' ? <CheckCircle2 className="h-16 w-16" /> : tono === 'ambar' ? <Hand className="h-16 w-16" /> : <XCircle className="h-16 w-16" />}
          <p className="text-3xl font-bold">
            {tono === 'verde'
              ? `¡Bienvenido, ${resultado?.nombre}!`
              : tono === 'ambar'
                ? `Hola, ${resultado?.nombre}`
                : resultado?.nombre
                  ? `${resultado.nombre}, pasa por recepción`
                  : 'Pasa por recepción'}
          </p>
          {(error || (resultado && detalle(resultado))) && <p className="text-lg opacity-90">{error ?? detalle(resultado!)}</p>}
        </div>
      ) : (
        <>
          <div className="flex h-16 min-w-[16rem] items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-6 text-3xl font-semibold tracking-widest" aria-live="polite">
            {saliendo ? '•'.repeat(pin.length) : documento}
            {!valor && <span className="text-lg font-normal tracking-normal text-slate-500">{saliendo ? '4 a 6 números' : 'Tu CI o documento'}</span>}
          </div>
          {saliendo && errorPin && <p className="text-rose-400">{errorPin}</p>}

          <div className="grid w-full max-w-sm grid-cols-3 gap-3">
            {TECLAS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => pulsar(t)}
                disabled={ingresar.isPending || salir.isPending || (t === 'ok' && (saliendo ? pin.length < 4 : documento.trim().length < 3))}
                aria-label={t === 'borrar' ? 'Borrar' : t === 'ok' ? 'Listo' : t}
                className={`flex h-20 items-center justify-center rounded-2xl text-3xl font-semibold transition-colors disabled:opacity-40 ${
                  t === 'ok' ? 'bg-indigo-600 hover:bg-indigo-700' : 'border border-slate-700 bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {t === 'borrar' ? <Delete className="h-7 w-7" /> : t === 'ok' ? (ingresar.isPending ? <Loader2 className="h-7 w-7 animate-spin" /> : 'OK') : t}
              </button>
            ))}
          </div>

          {saliendo && (
            <button type="button" onClick={() => setSaliendo(false)} className="text-sm text-slate-400 hover:text-slate-200">
              Cancelar y seguir en el kiosco
            </button>
          )}
        </>
      )}
    </div>
  );
}
