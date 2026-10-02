"use client";

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDebounce } from '@/hooks/use-debounce';
import { useToast } from '@/hooks/use-toast';
import { apiPost, apiPut, apiGet } from '@/lib/api-client';
import { ArrowDown, ArrowLeft, ArrowUp, Check, Loader2, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { claseCampo, EditorFiltros } from './editor-filtros';
import { EditorGrupoPersonalizado } from './editor-grupo-personalizado';
import { TablaResultados } from './tabla-resultados';
import {
  Carpeta,
  Catalogo,
  Definicion,
  FuncionTotal,
  Granularidad,
  NOMBRE_FUNCION,
  NOMBRE_GRAFICO,
  NOMBRE_GRANULARIDAD,
  ReporteGuardado,
  Resultado,
  TipoCatalogo,
  TipoGrafico,
  conGruposPersonalizados,
  GrupoPersonalizado,
} from './tipos';

type Pestana = 'columnas' | 'filtros' | 'agrupar' | 'totales' | 'grafico';

interface Props {
  catalogo: Catalogo;
  tipo: TipoCatalogo;
  inicial: Definicion;
  /** Al editar un reporte guardado. */
  reporte?: ReporteGuardado;
}

/**
 * Constructor de reportes (docs/plan-reporteria.md, fase 4): a la izquierda
 * las columnas del tipo, arriba qué se configura y abajo la vista previa en
 * vivo (primeras 50 filas), que se actualiza sola al cambiar algo.
 */
export function Constructor({ catalogo, tipo, inicial, reporte }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [def, setDef] = useState<Definicion>(inicial);
  const [nombre, setNombre] = useState(reporte?.nombre ?? '');
  const [pestana, setPestana] = useState<Pestana>('columnas');
  const [buscar, setBuscar] = useState('');
  const [guardando, setGuardando] = useState<'nuevo' | null>(null);
  const [editandoGrupo, setEditandoGrupo] = useState<GrupoPersonalizado | null | undefined>(undefined);
  // El tipo con los grupos personalizados como columnas más.
  const tipoVista = useMemo(() => conGruposPersonalizados(tipo, def.gruposPersonalizados), [tipo, def.gruposPersonalizados]);
  const col = (clave: string) => tipoVista.columnas.find((c) => c.clave === clave)!;
  const esTabla = def.formato === 'TABLA_CRUZADA';

  // El formato sale solo: con grupos es "Agrupado".
  const cambiar = (d: Definicion) =>
    setDef({ ...d, formato: d.formato === 'TABLA_CRUZADA' ? 'TABLA_CRUZADA' : d.agrupaciones.length > 0 ? 'AGRUPADO' : 'LISTA' });

  // ---- Vista previa en vivo
  const definicionPrevia = useDebounce(def, 500);
  const previa = useQuery({
    queryKey: ['reporteria-previa', definicionPrevia],
    queryFn: () => apiPost<Resultado>('/reporteria/vista-previa', { definicion: definicionPrevia }),
    placeholderData: (anterior) => anterior,
    retry: false,
    meta: { silencioso: true },
  });

  // ---- Columnas
  const grupos = useMemo(() => {
    const texto = buscar.trim().toLowerCase();
    const mapa = new Map<string, typeof tipo.columnas>();
    for (const c of tipoVista.columnas) {
      if (texto && !c.nombre.toLowerCase().includes(texto) && !c.grupo.toLowerCase().includes(texto)) continue;
      mapa.set(c.grupo, [...(mapa.get(c.grupo) ?? []), c]);
    }
    return [...mapa.entries()];
  }, [tipoVista, buscar]);

  const alternarColumna = (clave: string) => {
    if (def.columnas.includes(clave)) {
      cambiar({ ...def, columnas: def.columnas.filter((c) => c !== clave), orden: def.orden.filter((o) => o.columna !== clave || def.agrupaciones.some((g) => g.columna === clave)) });
    } else if (def.columnas.length < 40) {
      cambiar({ ...def, columnas: [...def.columnas, clave] });
    }
  };
  const mover = (i: number, d: -1 | 1) => {
    const columnas = [...def.columnas];
    [columnas[i], columnas[i + d]] = [columnas[i + d], columnas[i]];
    cambiar({ ...def, columnas });
  };

  // ---- Guardar
  const { data: carpetas } = useQuery({ queryKey: ['reporteria-carpetas'], queryFn: () => apiGet<Carpeta[]>('/reporteria/carpetas') });
  const [carpetaId, setCarpetaId] = useState<string>(reporte?.carpeta?.id ?? '');
  const [descripcion, setDescripcion] = useState(reporte?.descripcion ?? '');

  const guardar = useMutation({
    mutationFn: async (como: 'nuevo' | 'actualizar') => {
      const cuerpo = { nombre: nombre.trim(), descripcion: descripcion.trim() || undefined, carpetaId: carpetaId || null, definicion: def };
      return como === 'actualizar' && reporte
        ? apiPut<ReporteGuardado>(`/reporteria/reportes/${reporte.id}`, cuerpo)
        : apiPost<ReporteGuardado>('/reporteria/reportes', cuerpo);
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['reporteria-reportes'] });
      queryClient.invalidateQueries({ queryKey: ['reporteria-reporte', r.id] });
      toast({ title: 'Reporte guardado', description: r.nombre, variant: 'success' });
      router.push(`/dashboard/reporteria/${r.id}`);
    },
    onError: (err: Error) => toast({ title: 'No se pudo guardar', description: err.message, variant: 'destructive' }),
  });

  const agrupables = tipoVista.columnas.filter((c) => c.agrupable);
  const conPeriodo = (c: { clave: string; tipo: string }) => ({ columna: c.clave, ...(c.tipo === 'fecha' || c.tipo === 'fechaHora' ? { granularidad: 'mes' as Granularidad } : {}) });

  // Tabla cruzada (modo experto): filas (1 o 2 grupos) × columnas, un total por casilla.
  const elegirFormato = (tabla: boolean) => {
    if (!tabla) {
      setDef({ ...def, formato: def.agrupaciones.length ? 'AGRUPADO' : 'LISTA', columnaCruzada: undefined, mostrarDetalle: true });
      return;
    }
    const filas = def.agrupaciones.length ? def.agrupaciones.slice(0, 2) : [conPeriodo(agrupables.find((c) => c.tipo !== 'fechaHora' && c.tipo !== 'fecha') ?? agrupables[0])];
    const fecha = tipoVista.columnas.find((c) => c.clave === tipo.fechaPorDefecto);
    const propuesta = fecha && !filas.some((f) => f.columna === fecha.clave) ? fecha : agrupables.find((c) => !filas.some((f) => f.columna === c.clave));
    setDef({ ...def, formato: 'TABLA_CRUZADA', agrupaciones: filas, columnaCruzada: propuesta && conPeriodo(propuesta), totales: def.totales.slice(0, 1), mostrarDetalle: false });
  };

  // Grupos personalizados: crear, editar y quitar (con todo lo que los usaba).
  const claveNueva = `gp${Math.max(0, ...(def.gruposPersonalizados ?? []).map((g) => Number(g.clave.slice(2)))) + 1}`;
  const guardarGrupo = (g: GrupoPersonalizado) => {
    const otros = (def.gruposPersonalizados ?? []).filter((x) => x.clave !== g.clave);
    const existe = otros.length !== (def.gruposPersonalizados ?? []).length;
    cambiar({ ...def, gruposPersonalizados: existe ? (def.gruposPersonalizados ?? []).map((x) => (x.clave === g.clave ? g : x)) : [...otros, g] });
    setEditandoGrupo(undefined);
  };
  const quitarGrupo = (clave: string) => {
    const queda = (c: string) => c !== clave;
    cambiar({
      ...def,
      gruposPersonalizados: (def.gruposPersonalizados ?? []).filter((g) => g.clave !== clave),
      columnas: def.columnas.filter(queda),
      agrupaciones: def.agrupaciones.filter((g) => queda(g.columna)),
      columnaCruzada: def.columnaCruzada && queda(def.columnaCruzada.columna) ? def.columnaCruzada : undefined,
      totales: def.totales.filter((t) => queda(t.columna)),
      orden: def.orden.filter((o) => queda(o.columna)),
      filtros: {
        ...def.filtros,
        campos: def.filtros.campos.filter((f) => queda(f.columna)),
        logica: def.filtros.campos.some((f) => !queda(f.columna)) ? undefined : def.filtros.logica,
      },
    });
  };
  const ordenables = [...new Set([...def.agrupaciones.map((g) => g.columna), ...def.columnas])];

  const pestanas: { valor: Pestana; nombre: string; cuenta?: number }[] = [
    { valor: 'columnas', nombre: 'Columnas', cuenta: def.columnas.length },
    { valor: 'filtros', nombre: 'Filtros', cuenta: def.filtros.campos.length },
    { valor: 'agrupar', nombre: 'Agrupar', cuenta: def.agrupaciones.length },
    { valor: 'totales', nombre: 'Totales', cuenta: def.totales.length },
    { valor: 'grafico', nombre: 'Gráfico', cuenta: def.grafico && def.formato !== 'LISTA' ? 1 : undefined },
  ];

  // ---- Gráfico (fase 7): qué número muestra, la cantidad o un total con números.
  const valoresGrafico = [
    { valor: 'cantidad', nombre: 'Cantidad de registros', suma: true },
    ...def.totales
      .filter((t) => t.funcion === 'distintos' || ['numero', 'moneda'].includes(col(t.columna).tipo))
      .map((t) => ({ valor: `${t.funcion}:${t.columna}`, nombre: `${NOMBRE_FUNCION[t.funcion]} de ${col(t.columna).nombre}`, suma: t.funcion === 'suma' })),
  ];
  const tortaPosible = !esTabla || !def.totales[0] || def.totales[0].funcion === 'suma';
  const elegirGrafico = (tipoGrafico: TipoGrafico | null) => {
    if (!tipoGrafico) return cambiar({ ...def, grafico: undefined });
    const posibles = valoresGrafico.filter((v) => tipoGrafico !== 'torta' || v.suma);
    const actual = posibles.find((v) => v.valor === def.grafico?.valor);
    // Al elegirlo por primera vez, el primer total (suele ser el dinero).
    cambiar({ ...def, grafico: { tipo: tipoGrafico, valor: (actual ?? posibles[1] ?? posibles[0]).valor } });
  };

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => router.back()} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Reporte sin título"
            maxLength={150}
            className="w-full bg-transparent text-xl font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white"
            aria-label="Nombre del reporte"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {tipo.nombre} · {tipo.fila}
          </p>
        </div>
        {reporte?.puedeEditar ? (
          <>
            <Button variant="outline" className="dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800" onClick={() => setGuardando('nuevo')}>
              Guardar como…
            </Button>
            <Button onClick={() => (nombre.trim() ? guardar.mutate('actualizar') : setGuardando('nuevo'))} disabled={guardar.isPending}>
              <Save className="mr-1.5 h-4 w-4" /> Guardar
            </Button>
          </>
        ) : (
          <Button onClick={() => setGuardando('nuevo')}>
            <Save className="mr-1.5 h-4 w-4" /> Guardar
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* Panel de columnas */}
        <aside className="flex max-h-72 shrink-0 flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:max-h-none lg:w-64">
          <div className="border-b border-slate-200 p-2 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
              <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar columna" className={`${claseCampo} w-full pl-8`} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {grupos.map(([grupo, columnas]) => (
              <div key={grupo} className="mb-3">
                <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{grupo}</p>
                {columnas.map((c) => {
                  const puesta = def.columnas.includes(c.clave);
                  return (
                    <button
                      key={c.clave}
                      type="button"
                      onClick={() => alternarColumna(c.clave)}
                      title={c.ayuda}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                        puesta
                          ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      {c.nombre}
                      {puesta ? <Check className="h-4 w-4 shrink-0" /> : <Plus className="h-4 w-4 shrink-0 text-slate-400" />}
                    </button>
                  );
                })}
              </div>
            ))}
            {catalogo.avanzado && (
              <div className="mt-1 border-t border-slate-200 pt-3 dark:border-slate-800">
                {(def.gruposPersonalizados ?? []).map((g) => (
                  <div key={g.clave} className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="min-w-0 flex-1 truncate">
                      {g.nombre} <span className="text-slate-400">· de {tipo.columnas.find((c) => c.clave === g.columna)?.nombre}</span>
                    </span>
                    <button type="button" onClick={() => setEditandoGrupo(g)} className="rounded p-1 hover:text-slate-800 dark:hover:text-slate-200" aria-label={`Editar ${g.nombre}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => quitarGrupo(g.clave)} className="rounded p-1 hover:text-rose-600" aria-label={`Quitar ${g.nombre}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {(def.gruposPersonalizados ?? []).length < 5 && (
                  <button
                    type="button"
                    onClick={() => setEditandoGrupo(null)}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
                  >
                    <Plus className="h-4 w-4" /> Grupo personalizado
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Configuración */}
          <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-2 pt-2 dark:border-slate-800" role="tablist">
              {pestanas.map((p) => (
                <button
                  key={p.valor}
                  type="button"
                  role="tab"
                  aria-selected={pestana === p.valor}
                  onClick={() => setPestana(p.valor)}
                  className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                    pestana === p.valor ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {p.nombre}
                  {!!p.cuenta && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs dark:bg-slate-800">{p.cuenta}</span>}
                </button>
              ))}
            </div>
            <div className="p-4">
              {pestana === 'columnas' && esTabla && (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  La tabla cruzada no muestra filas de detalle: arma sus filas y columnas en la pestaña <strong>Agrupar</strong>.
                </p>
              )}
              {pestana === 'columnas' && !esTabla && (
                <div className="space-y-4">
                  {def.columnas.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Elige columnas en el panel de la izquierda.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {def.columnas.map((clave, i) => (
                        <span key={clave} className="inline-flex items-center gap-0.5 rounded-full border border-slate-300 bg-slate-50 py-0.5 pl-3 pr-1 text-sm dark:border-slate-700 dark:bg-slate-800">
                          {col(clave).nombre}
                          <button type="button" disabled={i === 0} onClick={() => mover(i, -1)} className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label={`Mover ${col(clave).nombre} a la izquierda`}>
                            <ArrowUp className="h-3.5 w-3.5 -rotate-90" />
                          </button>
                          <button type="button" disabled={i === def.columnas.length - 1} onClick={() => mover(i, 1)} className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label={`Mover ${col(clave).nombre} a la derecha`}>
                            <ArrowDown className="h-3.5 w-3.5 -rotate-90" />
                          </button>
                          <button type="button" onClick={() => alternarColumna(clave)} className="rounded p-0.5 text-slate-400 hover:text-rose-600" aria-label={`Quitar ${col(clave).nombre}`}>
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {ordenables.length > 0 && (
                    <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      Ordenar por
                      <select
                        className={claseCampo}
                        value={def.orden[0]?.columna ?? ''}
                        onChange={(e) => cambiar({ ...def, orden: e.target.value ? [{ columna: e.target.value, direccion: def.orden[0]?.direccion ?? 'asc' }] : [] })}
                      >
                        <option value="">Como vienen</option>
                        {ordenables.map((c) => (
                          <option key={c} value={c}>
                            {col(c).nombre}
                          </option>
                        ))}
                      </select>
                      {def.orden[0] && (
                        <select className={claseCampo} value={def.orden[0].direccion} onChange={(e) => cambiar({ ...def, orden: [{ ...def.orden[0], direccion: e.target.value as 'asc' | 'desc' }] })}>
                          <option value="asc">De menor a mayor (A→Z)</option>
                          <option value="desc">De mayor a menor (Z→A)</option>
                        </select>
                      )}
                    </label>
                  )}
                </div>
              )}

              {pestana === 'filtros' && <EditorFiltros tipo={tipoVista} catalogo={catalogo} definicion={def} cambiar={cambiar} />}

              {pestana === 'agrupar' && (
                <div className="space-y-3">
                  {catalogo.avanzado && (
                    <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm dark:bg-slate-800" role="group" aria-label="Formato">
                      {[
                        { tabla: false, nombre: 'Agrupado' },
                        { tabla: true, nombre: 'Tabla cruzada' },
                      ].map((o) => (
                        <button
                          key={o.nombre}
                          type="button"
                          aria-pressed={esTabla === o.tabla}
                          onClick={() => elegirFormato(o.tabla)}
                          className={`rounded-md px-3 py-1 font-medium ${esTabla === o.tabla ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                        >
                          {o.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {esTabla
                      ? 'Elige qué va en las filas (hasta 2) y qué en las columnas; cada casilla muestra la cantidad o el total elegido.'
                      : 'Agrupa las filas y ve un subtotal por grupo (hasta 3 niveles).'}
                  </p>
                  {def.agrupaciones.map((g, i) => {
                    const c = col(g.columna);
                    const esFecha = c.tipo === 'fecha' || c.tipo === 'fechaHora';
                    return (
                      <div key={i} className="flex flex-wrap items-center gap-2" style={{ paddingLeft: `${i * 1.25}rem` }}>
                        <span className="text-sm text-slate-500">{i === 0 ? (esTabla ? 'Filas por' : 'Agrupar por') : 'y luego por'}</span>
                        <select
                          className={claseCampo}
                          aria-label={`Agrupar por, nivel ${i + 1}`}
                          value={g.columna}
                          onChange={(e) => {
                            const nueva = col(e.target.value);
                            const fecha = nueva.tipo === 'fecha' || nueva.tipo === 'fechaHora';
                            cambiar({ ...def, agrupaciones: def.agrupaciones.map((x, j) => (j === i ? { columna: nueva.clave, ...(fecha ? { granularidad: 'mes' as Granularidad } : {}) } : x)) });
                          }}
                        >
                          {agrupables
                            .filter((x) => x.clave === g.columna || (!def.agrupaciones.some((y) => y.columna === x.clave) && x.clave !== def.columnaCruzada?.columna))
                            .map((x) => (
                              <option key={x.clave} value={x.clave}>
                                {x.nombre}
                              </option>
                            ))}
                        </select>
                        {esFecha && (
                          <select
                            className={claseCampo}
                            aria-label={`Periodo del nivel ${i + 1}`}
                            value={g.granularidad ?? 'dia'}
                            onChange={(e) => cambiar({ ...def, agrupaciones: def.agrupaciones.map((x, j) => (j === i ? { ...x, granularidad: e.target.value as Granularidad } : x)) })}
                          >
                            {(Object.keys(NOMBRE_GRANULARIDAD) as Granularidad[]).map((x) => (
                              <option key={x} value={x}>
                                {NOMBRE_GRANULARIDAD[x]}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={() => cambiar({ ...def, agrupaciones: def.agrupaciones.slice(0, i) })}
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                          aria-label={`Quitar el nivel ${i + 1}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                  {def.agrupaciones.length < (esTabla ? 2 : 3) && (
                    <button
                      type="button"
                      onClick={() => {
                        const libre =
                          agrupables.find((x) => !def.agrupaciones.some((y) => y.columna === x.clave) && x.clave !== def.columnaCruzada?.columna && x.tipo !== 'fechaHora') ??
                          agrupables[0];
                        const fecha = libre.tipo === 'fecha' || libre.tipo === 'fechaHora';
                        cambiar({ ...def, agrupaciones: [...def.agrupaciones, { columna: libre.clave, ...(fecha ? { granularidad: 'mes' as Granularidad } : {}) }] });
                      }}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      <Plus className="h-4 w-4" /> {def.agrupaciones.length === 0 ? 'Agrupar' : 'Agregar un nivel'}
                    </button>
                  )}
                  {esTabla && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                      <span className="text-sm text-slate-500">Columnas por</span>
                      <select
                        className={claseCampo}
                        aria-label="Columnas de la tabla"
                        value={def.columnaCruzada?.columna ?? ''}
                        onChange={(e) => cambiar({ ...def, columnaCruzada: conPeriodo(col(e.target.value)) })}
                      >
                        <option value="" disabled>
                          Elige…
                        </option>
                        {agrupables
                          .filter((x) => !def.agrupaciones.some((y) => y.columna === x.clave))
                          .map((x) => (
                            <option key={x.clave} value={x.clave}>
                              {x.nombre}
                            </option>
                          ))}
                      </select>
                      {def.columnaCruzada && ['fecha', 'fechaHora'].includes(col(def.columnaCruzada.columna).tipo) && (
                        <select
                          className={claseCampo}
                          aria-label="Periodo de las columnas"
                          value={def.columnaCruzada.granularidad ?? 'mes'}
                          onChange={(e) => cambiar({ ...def, columnaCruzada: { ...def.columnaCruzada!, granularidad: e.target.value as Granularidad } })}
                        >
                          {(Object.keys(NOMBRE_GRANULARIDAD) as Granularidad[]).map((x) => (
                            <option key={x} value={x}>
                              {NOMBRE_GRANULARIDAD[x]}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                  {!esTabla && def.agrupaciones.length > 0 && (
                    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={def.mostrarDetalle} onChange={(e) => cambiar({ ...def, mostrarDetalle: e.target.checked })} />
                      Mostrar las filas de cada grupo (si no, solo los subtotales)
                    </label>
                  )}
                </div>
              )}

              {pestana === 'grafico' && def.formato === 'LISTA' && (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  El gráfico muestra cada grupo: para usarlo, agrupa el reporte en la pestaña <strong>Agrupar</strong>.
                </p>
              )}
              {pestana === 'grafico' && def.formato !== 'LISTA' && (
                <div className="space-y-3">
                  <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1 text-sm dark:bg-slate-800" role="group" aria-label="Tipo de gráfico">
                    {([null, 'barras', 'lineas', 'torta'] as (TipoGrafico | null)[]).map((t) => {
                      const elegido = (def.grafico?.tipo ?? null) === t;
                      const deshabilitado = t === 'torta' && !tortaPosible;
                      return (
                        <button
                          key={t ?? 'ninguno'}
                          type="button"
                          aria-pressed={elegido}
                          disabled={deshabilitado}
                          title={deshabilitado ? 'La torta reparte cantidades o sumas: cambia el total de las casillas.' : undefined}
                          onClick={() => elegirGrafico(t)}
                          className={`rounded-md px-3 py-1 font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                            elegido ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          {t ? NOMBRE_GRAFICO[t] : 'Sin gráfico'}
                        </button>
                      );
                    })}
                  </div>
                  {def.grafico && !esTabla && (
                    <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      Qué muestra
                      <select
                        className={claseCampo}
                        value={valoresGrafico.some((v) => v.valor === def.grafico!.valor) ? def.grafico.valor : 'cantidad'}
                        onChange={(e) => cambiar({ ...def, grafico: { ...def.grafico!, valor: e.target.value } })}
                      >
                        {valoresGrafico
                          .filter((v) => def.grafico!.tipo !== 'torta' || v.suma)
                          .map((v) => (
                            <option key={v.valor} value={v.valor}>
                              {v.nombre}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {esTabla
                      ? 'Muestra el número de las casillas: en barras o líneas, cada fila de la tabla es una serie; en torta, cada fila es una porción.'
                      : def.agrupaciones.length > 1
                        ? `Un punto por cada grupo de "${col(def.agrupaciones[0].columna).nombre}" (el primer nivel). Para mostrar otro número, agrégalo en Totales.`
                        : 'Un punto por cada grupo. Para mostrar otro número, agrégalo en Totales.'}
                  </p>
                </div>
              )}

              {pestana === 'totales' && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {esTabla
                      ? 'Cada casilla muestra la cantidad de registros, o el total que elijas aquí (uno solo).'
                      : 'La cantidad de registros va siempre. Suma otros totales:'}
                  </p>
                  {def.totales.map((t, i) => {
                    const c = col(t.columna);
                    const numerica = c.tipo === 'numero' || c.tipo === 'moneda';
                    const comparable = numerica || c.tipo === 'fecha' || c.tipo === 'fechaHora';
                    const funciones = (Object.keys(NOMBRE_FUNCION) as FuncionTotal[]).filter(
                      (f) => f === 'distintos' || ((f === 'minimo' || f === 'maximo') && comparable) || numerica,
                    );
                    return (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <select
                          className={claseCampo}
                          aria-label={`Cálculo del total ${i + 1}`}
                          value={t.funcion}
                          onChange={(e) => cambiar({ ...def, totales: def.totales.map((x, j) => (j === i ? { ...x, funcion: e.target.value as FuncionTotal } : x)) })}
                        >
                          {funciones.map((f) => (
                            <option key={f} value={f}>
                              {NOMBRE_FUNCION[f]}
                            </option>
                          ))}
                        </select>
                        <span className="text-sm text-slate-500">de</span>
                        <select
                          className={claseCampo}
                          aria-label={`Columna del total ${i + 1}`}
                          value={t.columna}
                          onChange={(e) => {
                            const nueva = col(e.target.value);
                            const num = nueva.tipo === 'numero' || nueva.tipo === 'moneda';
                            cambiar({ ...def, totales: def.totales.map((x, j) => (j === i ? { columna: nueva.clave, funcion: num ? 'suma' : 'distintos' } : x)) });
                          }}
                        >
                          {tipoVista.columnas.map((x) => (
                            <option key={x.clave} value={x.clave}>
                              {x.nombre}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => cambiar({ ...def, totales: def.totales.filter((_, j) => j !== i) })}
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                          aria-label={`Quitar el total ${i + 1}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                  {(!esTabla || def.totales.length === 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      // Primero una columna de dinero o número que ya esté en el reporte.
                      const elegidas = def.columnas.map(col);
                      const numerica =
                        elegidas.find((c) => c.tipo === 'moneda') ??
                        elegidas.find((c) => c.tipo === 'numero') ??
                        tipo.columnas.find((c) => c.tipo === 'moneda') ??
                        tipo.columnas.find((c) => c.tipo === 'numero');
                      const c = numerica ?? tipo.columnas[0];
                      cambiar({ ...def, totales: [...def.totales, { columna: c.clave, funcion: numerica ? 'suma' : 'distintos' }] });
                    }}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    <Plus className="h-4 w-4" /> Agregar un total
                  </button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Vista previa */}
          <section className="min-h-0 flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Vista previa</h3>
              <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                {previa.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {previa.data &&
                  (previa.data.totalFilas === 0
                    ? 'Sin filas'
                    : previa.data.filas === null
                      ? // Tabla cruzada o agrupado sin detalle: no hay filas que mostrar, solo registros.
                        `${previa.data.totalFilas.toLocaleString('es-ES')} ${previa.data.totalFilas === 1 ? 'registro' : 'registros'}`
                    : previa.data.totalFilas <= previa.data.porPagina
                      ? `${previa.data.totalFilas.toLocaleString('es-ES')} ${previa.data.totalFilas === 1 ? 'fila' : 'filas'}`
                      : `Primeras ${previa.data.porPagina} de ${previa.data.totalFilas.toLocaleString('es-ES')} filas`)}
              </span>
            </div>
            {previa.error ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                {(previa.error as Error).message}
              </p>
            ) : previa.data ? (
              <TablaResultados resultado={previa.data} />
            ) : (
              <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            )}
          </section>
        </div>
      </div>

      {editandoGrupo !== undefined && (
        <EditorGrupoPersonalizado tipo={tipo} grupo={editandoGrupo} claveNueva={claveNueva} guardar={guardarGrupo} cerrar={() => setEditandoGrupo(undefined)} />
      )}

      <Dialog open={guardando === 'nuevo'} onOpenChange={(a) => !a && setGuardando(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{reporte ? 'Guardar como un reporte nuevo' : 'Guardar el reporte'}</DialogTitle>
            <DialogDescription>Lo vas a poder abrir y repetir cuando quieras.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              guardar.mutate('nuevo', { onSuccess: () => setGuardando(null) });
            }}
          >
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Nombre</span>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ventas del mes por plan" maxLength={150} required autoFocus />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Descripción (opcional)</span>
              <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={500} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Carpeta</span>
              <select className={`${claseCampo} w-full`} value={carpetaId} onChange={(e) => setCarpetaId(e.target.value)}>
                <option value="">Mis reportes (solo yo)</option>
                {(carpetas ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.visibilidad === 'COMPARTIDA' ? ' (compartida)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setGuardando(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardar.isPending || !nombre.trim()}>
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
