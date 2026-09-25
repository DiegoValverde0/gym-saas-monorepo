"use client";

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Lock } from 'lucide-react';
import { AuthUser } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

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
    if (previo.rolNombre !== actual.rolNombre) partes.push(`tu rol es ${actual.rolNombre ?? 'otro'}`);
    toast({ title: 'Tu acceso cambió', description: `${partes.join(' y ')}. No hace falta cerrar sesión.` });
    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'auth-me' });
  }, [user, toast, queryClient]);
}

// Etiqueta en la barra superior con el alcance de la sesión: todas las
// sucursales o solo una. Al tocarla explica qué significa y quién lo cambia.
export function IndicadorAlcance({ user }: { user: AuthUser }) {
  const [abierto, setAbierto] = useState(false);
  const limitado = !!user.sucursalId;

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
                : 'Ves y gestionas los datos de todas las sucursales del gimnasio.'}
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
