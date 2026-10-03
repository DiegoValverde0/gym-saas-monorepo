"use client";

import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { fechaISO } from '@/lib/formato';

export { bs, NOMBRE_PAGO } from '@/lib/formato';

export type RangoPreset = 'mes' | 'mes_pasado' | 'tres_meses';

const iso = fechaISO;

// Rango de fechas locales del navegador para los reportes (el servidor
// interpreta las fechas en la zona horaria de la organización).
export function rangoDe(preset: RangoPreset): { desde: string; hasta: string } {
  const hoy = new Date();
  if (preset === 'mes_pasado') {
    return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)), hasta: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 0)) };
  }
  if (preset === 'tres_meses') return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1)), hasta: iso(hoy) };
  return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: iso(hoy) };
}

const PRESETS: { valor: RangoPreset; nombre: string }[] = [
  { valor: 'mes', nombre: 'Este mes' },
  { valor: 'mes_pasado', nombre: 'Mes pasado' },
  { valor: 'tres_meses', nombre: 'Últimos 3 meses' },
];

export function SelectorRango({ valor, onChange }: { valor: RangoPreset; onChange: (v: RangoPreset) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Período">
      {PRESETS.map((p) => (
        <button
          key={p.valor}
          type="button"
          onClick={() => onChange(p.valor)}
          aria-pressed={p.valor === valor}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            p.valor === valor
              ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
              : 'border-slate-200 text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:text-slate-300'
          }`}
        >
          {p.nombre}
        </button>
      ))}
    </div>
  );
}

// Descarga una tabla como CSV (Excel la abre directo). Solo en modo experto.
export function BotonCsv({ nombre, columnas, filas }: { nombre: string; columnas: string[]; filas: (string | number)[][] }) {
  const descargar = () => {
    const celda = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [columnas, ...filas].map((f) => f.map(celda).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`${String.fromCharCode(0xfeff)}${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nombre}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Button type="button" variant="outline" size="sm" onClick={descargar} disabled={filas.length === 0}>
      <Download className="mr-1.5 h-3.5 w-3.5" /> Descargar CSV
    </Button>
  );
}

export function TablaSimple({ columnas, filas, vacio }: { columnas: { titulo: string; derecha?: boolean }[]; filas: ReactNode[][]; vacio: string }) {
  if (filas.length === 0) {
    return <p className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500 dark:text-slate-400">{vacio}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-800">
            {columnas.map((c) => (
              <th key={c.titulo} className={`px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 ${c.derecha ? 'text-right' : 'text-left'}`}>{c.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {filas.map((fila, i) => (
            <tr key={i}>
              {fila.map((celda, j) => (
                <td key={j} className={`px-3 py-2 ${columnas[j]?.derecha ? 'text-right tabular-nums' : ''} text-slate-700 dark:text-slate-200`}>{celda}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
