"use client";

import { ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';

/**
 * Toda la Reportería pide reportes:leer. Sin él (por ejemplo, un instructor
 * que escribe la dirección a mano) se explica en lugar de mostrar una página
 * vacía que invita a armar reportes.
 */
export default function ReporteriaLayout({ children }: { children: ReactNode }) {
  const { data, hasPermission } = usePermissions();
  if (data && !hasPermission('reportes:leer')) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <BarChart3 className="mx-auto h-8 w-8 text-slate-400" />
        <h1 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">No tienes acceso a la reportería</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Si la necesitas, pídele al dueño del gimnasio que te dé el permiso de Reportería en tu rol.</p>
      </div>
    );
  }
  return <>{children}</>;
}
