"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, X } from 'lucide-react';
import { claseCampo } from './editor-filtros';
import { GrupoPersonalizado, TipoCatalogo } from './tipos';

interface Props {
  tipo: TipoCatalogo;
  /** null = uno nuevo con esta clave. */
  grupo: GrupoPersonalizado | null;
  claveNueva: string;
  guardar: (g: GrupoPersonalizado) => void;
  cerrar: () => void;
}

/**
 * Grupo personalizado (docs/plan-reporteria.md, fase 6): una columna nueva que
 * agrupa los valores de otra. Números en tramos ("Menos de 100", "100 a 500"),
 * listas y textos en conjuntos. El servidor valida todo otra vez.
 */
export function EditorGrupoPersonalizado({ tipo, grupo, claveNueva, guardar, cerrar }: Props) {
  const elegibles = tipo.columnas.filter((c) => ['numero', 'moneda', 'texto', 'lista'].includes(c.tipo));
  const [nombre, setNombre] = useState(grupo?.nombre ?? '');
  const [columna, setColumna] = useState(grupo?.columna ?? elegibles[0]?.clave ?? '');
  const [otros, setOtros] = useState(grupo?.otros ?? 'Otros');
  const [rangos, setRangos] = useState<{ hasta: string; etiqueta: string }[]>(
    grupo?.rangos?.map((r) => ({ hasta: String(r.hasta), etiqueta: r.etiqueta })) ?? [{ hasta: '', etiqueta: '' }],
  );
  const [conjuntos, setConjuntos] = useState<{ etiqueta: string; valores: string[] }[]>(grupo?.valores ?? [{ etiqueta: '', valores: [] }]);
  const base = elegibles.find((c) => c.clave === columna);
  const numerica = base?.tipo === 'numero' || base?.tipo === 'moneda';
  const lista = base?.tipo === 'lista';

  const listo =
    !!nombre.trim() &&
    !!base &&
    (numerica
      ? rangos.length > 0 && rangos.every((r) => r.hasta !== '' && Number.isFinite(Number(r.hasta)) && r.etiqueta.trim())
      : conjuntos.length > 0 && conjuntos.every((c) => c.etiqueta.trim() && c.valores.length > 0));

  const aceptar = () => {
    guardar({
      clave: grupo?.clave ?? claveNueva,
      nombre: nombre.trim(),
      columna,
      otros: otros.trim() || 'Otros',
      ...(numerica
        ? { rangos: rangos.map((r) => ({ hasta: Number(r.hasta), etiqueta: r.etiqueta.trim() })) }
        : { valores: conjuntos.map((c) => ({ etiqueta: c.etiqueta.trim(), valores: c.valores })) }),
    });
  };

  return (
    <Dialog open onOpenChange={(a) => !a && cerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{grupo ? 'Editar grupo personalizado' : 'Nuevo grupo personalizado'}</DialogTitle>
          <DialogDescription>Una columna nueva que junta valores: por ejemplo, ventas "Chicas", "Medianas" y "Grandes".</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Nombre</span>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tamaño de la venta" maxLength={60} autoFocus />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">A partir de la columna</span>
            <select
              className={`${claseCampo} w-full`}
              value={columna}
              onChange={(e) => {
                setColumna(e.target.value);
                setRangos([{ hasta: '', etiqueta: '' }]);
                setConjuntos([{ etiqueta: '', valores: [] }]);
              }}
            >
              {elegibles.map((c) => (
                <option key={c.clave} value={c.clave}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>

          {numerica ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Tramos (de menor a mayor)</p>
              {rangos.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-sm text-slate-500">{i === 0 ? 'Menos de' : 'hasta'}</span>
                  <input
                    type="number"
                    className={`${claseCampo} w-28`}
                    value={r.hasta}
                    onChange={(e) => setRangos(rangos.map((x, j) => (j === i ? { ...x, hasta: e.target.value } : x)))}
                    aria-label={`Límite del tramo ${i + 1}`}
                  />
                  <span className="text-sm text-slate-500">se llama</span>
                  <input
                    className={`${claseCampo} min-w-0 flex-1`}
                    value={r.etiqueta}
                    placeholder={i === 0 ? 'Chica' : 'Mediana'}
                    maxLength={40}
                    onChange={(e) => setRangos(rangos.map((x, j) => (j === i ? { ...x, etiqueta: e.target.value } : x)))}
                    aria-label={`Nombre del tramo ${i + 1}`}
                  />
                  <button type="button" disabled={rangos.length === 1} onClick={() => setRangos(rangos.filter((_, j) => j !== i))} className="rounded p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30" aria-label={`Quitar el tramo ${i + 1}`}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {rangos.length < 10 && (
                <button type="button" onClick={() => setRangos([...rangos, { hasta: '', etiqueta: '' }])} className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                  <Plus className="h-4 w-4" /> Otro tramo
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Conjuntos</p>
              {conjuntos.map((c, i) => {
                const enOtros = new Set(conjuntos.flatMap((x, j) => (j === i ? [] : x.valores)));
                return (
                  <div key={i} className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <input
                        className={`${claseCampo} min-w-0 flex-1`}
                        value={c.etiqueta}
                        placeholder="Nombre del conjunto"
                        maxLength={40}
                        onChange={(e) => setConjuntos(conjuntos.map((x, j) => (j === i ? { ...x, etiqueta: e.target.value } : x)))}
                        aria-label={`Nombre del conjunto ${i + 1}`}
                      />
                      <button type="button" disabled={conjuntos.length === 1} onClick={() => setConjuntos(conjuntos.filter((_, j) => j !== i))} className="rounded p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30" aria-label={`Quitar el conjunto ${i + 1}`}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {lista ? (
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {Object.entries(base!.opciones ?? {}).map(([valor, nombreValor]) => (
                          <label key={valor} className={`flex items-center gap-1.5 text-sm ${enOtros.has(valor) ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}`}>
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-indigo-600"
                              disabled={enOtros.has(valor)}
                              checked={c.valores.includes(valor)}
                              onChange={(e) =>
                                setConjuntos(conjuntos.map((x, j) => (j === i ? { ...x, valores: e.target.checked ? [...x.valores, valor] : x.valores.filter((v) => v !== valor) } : x)))
                              }
                            />
                            {nombreValor}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        className={`${claseCampo} h-20 w-full py-1.5`}
                        placeholder="Un valor por línea, escrito igual que en el reporte"
                        value={c.valores.join('\n')}
                        onChange={(e) => setConjuntos(conjuntos.map((x, j) => (j === i ? { ...x, valores: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean) } : x)))}
                        aria-label={`Valores del conjunto ${i + 1}`}
                      />
                    )}
                  </div>
                );
              })}
              {conjuntos.length < 10 && (
                <button type="button" onClick={() => setConjuntos([...conjuntos, { etiqueta: '', valores: [] }])} className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                  <Plus className="h-4 w-4" /> Otro conjunto
                </button>
              )}
            </div>
          )}

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">{numerica ? 'Lo que queda arriba del último tramo (y lo vacío) se llama' : 'Lo que no está en ningún conjunto se llama'}</span>
            <Input value={otros} onChange={(e) => setOtros(e.target.value)} maxLength={40} />
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={cerrar}>
            Cancelar
          </Button>
          <Button type="button" disabled={!listo} onClick={aceptar}>
            {grupo ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
