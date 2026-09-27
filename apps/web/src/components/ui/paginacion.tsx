"use client";

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaginacionProps {
  pagina: number;
  totalPaginas: number;
  total: number;
  porPagina: number;
  onCambiar: (pagina: number) => void;
  /** Lo que se lista, en singular y plural (ej. ['cliente', 'clientes']). */
  nombre?: [string, string];
  actualizando?: boolean;
}

// Pie de las listas paginadas en el servidor (ver useListaPaginada).
export function Paginacion({ pagina, totalPaginas, total, porPagina, onCambiar, nombre = ['registro', 'registros'], actualizando }: PaginacionProps) {
  if (total === 0) return null;
  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {totalPaginas > 1 ? `${desde}–${hasta} de ${total} ${nombre[1]}` : `${total} ${nombre[total === 1 ? 0 : 1]}`}
      </p>
      {totalPaginas > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onCambiar(pagina - 1)} disabled={pagina <= 1 || actualizando}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
          </Button>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Página {pagina} de {totalPaginas}
          </span>
          <Button variant="outline" size="sm" onClick={() => onCambiar(pagina + 1)} disabled={pagina >= totalPaginas || actualizando}>
            Siguiente <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
