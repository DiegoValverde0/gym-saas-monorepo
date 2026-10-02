"use client";

import { useMemo, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NOMBRE_GRAFICO, ReporteGuardado } from '@/app/dashboard/reporteria/tipos';
import { NOMBRE_TAMANO, TamanoTarjeta, TARJETAS_PROPIAS, TarjetaTablero } from '@/lib/tablero';

// La galería de "Personalizar el Inicio" (docs/plan-inicio.md, fase 3): las
// tarjetas propias, las plantillas y los reportes guardados con gráfico. Al
// elegir una se ve de verdad (con los datos del gimnasio) antes de agregarla.

export interface OpcionGaleria {
  id: string;
  nombre: string;
  descripcion: string;
  grupo: 'Del Inicio' | 'Plantillas' | 'Tus reportes';
  forma: string;
  tamano: TamanoTarjeta;
}

/** Lo que se puede agregar, según los permisos y los reportes que ve esta persona. */
export function opcionesGaleria(reportes: ReporteGuardado[], hasPermission: (p: string) => boolean): OpcionGaleria[] {
  const propias: OpcionGaleria[] = TARJETAS_PROPIAS.filter((t) => hasPermission(t.permiso)).map((t) => ({
    id: t.id,
    nombre: t.nombre,
    descripcion: t.descripcion,
    grupo: 'Del Inicio',
    forma: t.id === 'estado-clientes' ? 'Barra apilada' : 'Lista',
    tamano: t.tamano,
  }));
  if (!hasPermission('reportes:leer')) return propias;
  const deReporte = (r: ReporteGuardado, id: string, grupo: OpcionGaleria['grupo']): OpcionGaleria => ({
    id,
    nombre: r.nombre,
    descripcion: r.descripcion ?? r.tipo.nombre,
    grupo,
    forma: r.grafico ? NOMBRE_GRAFICO[r.grafico] : 'Lista',
    // Los que se leen a lo ancho: el mapa de calor y las comparaciones de una tabla cruzada.
    tamano: r.grafico === 'calor' || (r.formato === 'TABLA_CRUZADA' && !!r.grafico) ? 'ancha' : 'mediana',
  });
  return [
    ...propias,
    ...reportes.filter((r) => r.esPlantilla && r.clavePlantilla).map((r) => deReporte(r, `plantilla:${r.clavePlantilla}`, 'Plantillas')),
    // De los guardados, solo los que tienen gráfico (decisión I2).
    ...reportes.filter((r) => !r.esPlantilla && !r.eliminadoEl && r.grafico).map((r) => deReporte(r, `reporte:${r.id}`, 'Tus reportes')),
  ];
}

const claseSelector =
  'h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';

export function GaleriaTarjetas({
  abierta,
  onCerrar,
  opciones,
  actuales,
  lleno,
  onAgregar,
  vistaPrevia,
}: {
  abierta: boolean;
  onCerrar: () => void;
  opciones: OpcionGaleria[];
  /** Los id que ya están en el Inicio. */
  actuales: string[];
  /** Ya no entran más tarjetas. */
  lleno: boolean;
  onAgregar: (t: TarjetaTablero) => void;
  /** La tarjeta tal como se va a ver (la arma el tablero). */
  vistaPrevia: (t: TarjetaTablero) => React.ReactNode;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [elegidaId, setElegidaId] = useState<string | null>(null);
  const [tamano, setTamano] = useState<TamanoTarjeta | null>(null);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q ? opciones.filter((o) => `${o.nombre} ${o.descripcion} ${o.forma}`.toLowerCase().includes(q)) : opciones;
  }, [busqueda, opciones]);
  const elegida = opciones.find((o) => o.id === elegidaId) ?? filtradas.find((o) => !actuales.includes(o.id)) ?? filtradas[0];
  const tamanoElegido = tamano ?? elegida?.tamano ?? 'mediana';
  const yaEsta = !!elegida && actuales.includes(elegida.id);
  const elegir = (id: string) => {
    setElegidaId(id);
    setTamano(null);
  };

  return (
    <Dialog open={abierta} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl dark:bg-slate-900">
        <DialogHeader>
          <DialogTitle>Agregar una tarjeta</DialogTitle>
          <DialogDescription>Elige una para verla con los datos de tu gimnasio y agrégala a tu Inicio.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-4 md:grid-cols-[18rem_1fr]">
          <div className="flex min-h-0 flex-col gap-2">
            <label className="relative">
              <span className="sr-only">Buscar una tarjeta</span>
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar: ventas, clientes, horas…"
                className="h-9 w-full rounded-md border border-slate-200 bg-white pl-8 pr-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </label>
            <div className="max-h-[22rem] overflow-y-auto md:max-h-[60vh]" role="listbox" aria-label="Tarjetas para agregar">
              {(['Del Inicio', 'Plantillas', 'Tus reportes'] as const).map((grupo) => {
                const delGrupo = filtradas.filter((o) => o.grupo === grupo);
                if (delGrupo.length === 0) return null;
                return (
                  <div key={grupo} className="mb-3">
                    <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{grupo}</p>
                    {delGrupo.map((o) => {
                      const activa = elegida?.id === o.id;
                      const esta = actuales.includes(o.id);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          role="option"
                          aria-selected={activa}
                          onClick={() => elegir(o.id)}
                          className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                            activa ? 'bg-indigo-50 text-indigo-900 dark:bg-indigo-500/15 dark:text-white' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{o.nombre}</span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400">
                              {o.forma}
                              {esta && ' · ya está en tu Inicio'}
                            </span>
                          </span>
                          {esta && <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {filtradas.length === 0 && <p className="px-1 py-6 text-center text-sm text-slate-500">No hay tarjetas con ese nombre.</p>}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            {elegida ? (
              <>
                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                  {/* La clave hace que cambie de reporte de verdad al elegir otra. */}
                  <div key={elegida.id}>{vistaPrevia({ id: elegida.id, tamano: tamanoElegido })}</div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    Tamaño
                    <select className={claseSelector} value={tamanoElegido} onChange={(e) => setTamano(e.target.value as TamanoTarjeta)}>
                      {(Object.keys(NOMBRE_TAMANO) as TamanoTarjeta[]).map((t) => (
                        <option key={t} value={t}>
                          {NOMBRE_TAMANO[t]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={yaEsta || lleno}
                    onClick={() => onAgregar({ id: elegida.id, tamano: tamanoElegido })}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    {yaEsta ? 'Ya está en tu Inicio' : lleno ? 'El Inicio está lleno' : 'Agregar al Inicio'}
                  </button>
                </div>
              </>
            ) : (
              <p className="py-10 text-center text-sm text-slate-500">No hay tarjetas para agregar.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
