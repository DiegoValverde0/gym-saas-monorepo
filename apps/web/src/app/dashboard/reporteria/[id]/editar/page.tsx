"use client";

import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { useCatalogo, useReporte } from '../../datos';
import { Constructor } from '../../constructor';

/** Editar un reporte guardado en el constructor. */
export default function EditarReportePage({ params }: { params: { id: string } }) {
  const { data: catalogo } = useCatalogo();
  const { data: reporte, error } = useReporte(params.id);

  if (error) return <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">{(error as Error).message}</p>;
  if (!catalogo || !reporte) return <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />;

  const tipo = catalogo.tipos.find((t) => t.clave === reporte.tipo.clave);
  if (!reporte.puedeEditar || !tipo || !reporte.definicion) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-10 text-center">
        <p className="text-slate-600 dark:text-slate-300">
          {reporte.esPlantilla ? 'Las plantillas no se cambian: duplícala y cambia la copia.' : 'No puedes editar este reporte.'}
        </p>
        <Link href={`/dashboard/reporteria/${reporte.id}`} className={buttonVariants({ variant: 'outline' })}>
          Ver el reporte
        </Link>
      </div>
    );
  }
  return <Constructor catalogo={catalogo} tipo={tipo} inicial={reporte.definicion} reporte={reporte} />;
}
