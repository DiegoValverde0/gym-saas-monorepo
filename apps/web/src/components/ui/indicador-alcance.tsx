"use client";

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Lock, MapPin } from 'lucide-react';
import { AuthUser } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useSucursalActiva } from '@/hooks/use-sucursal-activa';
import { nombreRol } from '@/lib/roles';

const describirAlcance = (user: AuthUser) =>
  user.sucursalId ? `solo con ${user.sucursalNombre ?? 'una sucursal'}` : 'con todas las sucursales';

/**
 * Avisa cuando el acceso de la sesión cambia sin cerrar sesión (otra persona
 * o uno mismo cambió su rol o sucursal): el backend ya resuelve el acceso en
 * cada petición, así que basta con detectar el cambio en /auth/me, avisar y
 * recargar los datos, que pueden depender de la sucursal.
 */
export function useAvisoCambioAcceso(user: AuthUser | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const anterior = useRef<{ sucursalId: string | null; rolNombre: string | null } | null>(null);

  useEffect(() => {
    if (!user || user.is_superadmin) return;
    const actual = { sucursalId: user.sucursalId ?? null, rolNombre: user.rolNombre ?? null };
    const previo = anterior.current;
    anterior.current = actual;
    if (!previo || (previo.sucursalId === actual.sucursalId && previo.rolNombre === actual.rolNombre)) return;

    const partes: string[] = [];
    if (previo.sucursalId !== actual.sucursalId) partes.push(`ahora trabajas ${describirAlcance(user)}`);
    if (previo.rolNombre !== actual.rolNombre) partes.push(`tu rol es ${nombreRol(actual.rolNombre) || 'otro'}`);
    toast({ title: 'Tu acceso cambió', description: `${partes.join(' y ')}. No hace falta cerrar sesión.` });
    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'auth-me' });
  }, [user, toast, queryClient]);
}

// Selector de la sucursal activa (quien tiene acceso a todas y la
// organización tiene más de una). Todas las pantallas trabajan con ella.
export function SelectorSucursal() {
  const { sucursalId, sucursales, puedeElegir, cambiar } = useSucursalActiva();
  const queryClient = useQueryClient();
  if (!puedeElegir) return null;
  return (
    <label className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
      <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
      <span className="sr-only">Sucursal activa</span>
      <select
        value={sucursalId ?? ''}
        onChange={(e) => {
          cambiar(e.target.value);
          // Las pantallas usan la sucursal en sus consultas: se recargan con la nueva.
          queryClient.invalidateQueries({ predicate: (q) => !['auth-me', 'permissions', 'sucursales'].includes(String(q.queryKey[0])) });
        }}
        className="bg-transparent outline-none cursor-pointer max-w-[160px] truncate"
      >
        {sucursales.map((s) => (
          <option key={s.id} value={s.id}>{s.nombre}{s.esPrincipal ? ' (principal)' : ''}</option>
        ))}
      </select>
    </label>
  );
}

// Etiqueta en la barra superior con el alcance de la sesión: todas las
// sucursales o solo una. Al tocarla explica qué significa y quién lo cambia.
// Con una sola sucursal en el gimnasio no hay nada que explicar y no se muestra.
export function IndicadorAlcance({ user }: { user: AuthUser }) {
  const [abierto, setAbierto] = useState(false);
  const { variasSucursales } = useSucursalActiva();
  const limitado = !!user.sucursalId;
  if (!limitado && !variasSucursales) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className={
          limitado
            ? 'flex items-center gap-1.5 bg-amber-50 dark:bg-amber-500/20 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 rounded-md px-2.5 py-1 text-xs font-bold'
            : 'flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-100 dark:border-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-md px-2.5 py-1 text-xs font-bold'
        }
      >
        {limitado ? <Lock className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
        <span className="truncate max-w-[160px]">
          {limitado ? `Solo ${user.sucursalNombre ?? 'una sucursal'}` : 'Todas las sucursales'}
        </span>
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)}></div>
          <div className="absolute right-0 mt-2 w-72 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg z-50 p-4 text-xs text-slate-600 dark:text-slate-300 space-y-2">
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {limitado ? 'Acceso limitado a una sucursal' : 'Acceso a todas las sucursales'}
            </p>
            <p>
              {limitado
                ? `Ves y gestionas solo los datos de ${user.sucursalNombre ?? 'tu sucursal'} y del equipo que trabaja en ella o en todas.`
                : 'Puedes trabajar en cualquier sucursal del gimnasio: elige en el selector de al lado con cuál trabajas ahora. Se recuerda en este navegador.'}
            </p>
            <p>
              Lo cambia un administrador con acceso a todas las sucursales, desde Equipo. El cambio aplica en tu siguiente acción, sin cerrar sesión.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
