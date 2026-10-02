"use client";

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, ArrowUpRight, Check, GripVertical, Plus, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { apiGet, apiPost, apiPut } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';
import { useModulosActivos } from '@/hooks/use-modulos-activos';
import { useModoUso } from '@/hooks/use-modo-uso';
import { useTenantStore } from '@/store/use-tenant-store';
import { CLASE_TAMANO, disenoSugerido, emparejar, MAX_TARJETAS, NOMBRE_TAMANO, RANGOS_TARJETA, TamanoTarjeta, TARJETAS_PROPIAS, TarjetaTablero } from '@/lib/tablero';
import { PorVencer } from '@/components/ui/por-vencer';
import { GaleriaTarjetas, opcionesGaleria } from './galeria';
import { MarcaEjemplo, useEsEjemplo } from './ejemplos';
import { ESTADO_CLIENTES_EJEMPLO, resultadoDeEjemplo } from '@/lib/ejemplos';
import { GraficoReporte } from '@/app/dashboard/reporteria/grafico-reporte';
import { formatearValor, NOMBRE_RANGO, RangoFecha, ReporteGuardado, Resultado } from '@/app/dashboard/reporteria/tipos';

// Las tarjetas del Inicio (docs/plan-inicio.md, fases 2 y 3): gráficos y
// listas de la reportería (plantillas y reportes guardados), el estado de los
// clientes y los vencimientos, en el orden y tamaño que guardó el gimnasio.
// Con "Personalizar el Inicio" se agregan, quitan, ordenan y cambian de tamaño.

type Ejecucion = Resultado & { reporte: ReporteGuardado };

const claseTarjeta = 'flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900';
const claseSelector =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';

/** Las primeras filas de un reporte de lista (sin gráfico), con sus primeras columnas. */
function ListaCorta({ resultado }: { resultado: Resultado }) {
  const columnas = resultado.columnas.slice(0, 3);
  return (
    <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
      {(resultado.filas ?? []).slice(0, 6).map((f, i) => (
        <li key={i} className="flex items-baseline justify-between gap-3 py-2">
          <span className="min-w-0 truncate font-medium text-slate-900 dark:text-white">{formatearValor(f[columnas[0].clave], columnas[0].tipo, columnas[0].opciones)}</span>
          {/* Hasta la mitad del ancho: en el celular, el nombre no se corta. */}
          <span className="min-w-0 max-w-[50%] truncate text-right text-xs text-slate-500 dark:text-slate-400">
            {columnas
              .slice(1)
              .map((c) => formatearValor(f[c.clave], c.tipo, c.opciones))
              .join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Una tarjeta que corre un reporte (plantilla o guardado) con su período. */
function TarjetaReporte({ reporteId, nombre, rangoInicial }: { reporteId: string; nombre?: string; rangoInicial?: RangoFecha }) {
  const [rango, setRango] = useState<RangoFecha | undefined>(rangoInicial);
  const { data, isLoading, error } = useQuery({
    queryKey: ['inicio-tarjeta', reporteId, rango],
    queryFn: () => apiPost<Ejecucion>(`/reporteria/reportes/${reporteId}/ejecutar`, { porPagina: 6, ...(rango ? { filtros: { fecha: { rango } } } : {}) }),
    placeholderData: (anterior) => anterior,
    meta: { silencioso: true },
    retry: false,
  });
  const titulo = data?.reporte.nombre ?? nombre ?? 'Reporte';
  const rangoActual = rango ?? data?.definicion.filtros.fecha.rango;
  const conGrafico = data?.definicion.grafico && data.definicion.formato !== 'LISTA';
  // Un gimnasio sin datos ve el gráfico con números de ejemplo (las listas, vacías).
  const ejemplo = useEsEjemplo() && !!data && data.totalFilas === 0 && conGrafico ? resultadoDeEjemplo(data) : null;
  const vacio = data && data.totalFilas === 0 && !ejemplo;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-900 dark:text-white">{titulo}</h3>
            {ejemplo && <MarcaEjemplo />}
          </div>
          {data?.reporte.descripcion && <p className="text-xs text-slate-500 dark:text-slate-400">{data.reporte.descripcion}</p>}
        </div>
        <div className="flex items-center gap-2">
          {rangoActual && rangoActual !== 'personalizado' && (
            <select aria-label={`Período de ${titulo}`} className={claseSelector} value={rangoActual} onChange={(e) => setRango(e.target.value as RangoFecha)}>
              {RANGOS_TARJETA.map((r) => (
                <option key={r} value={r}>
                  {NOMBRE_RANGO[r]}
                </option>
              ))}
            </select>
          )}
          <Link
            href={`/dashboard/reporteria/${reporteId}`}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
            aria-label={`Ver el reporte completo: ${titulo}`}
          >
            Ver completo <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
      {isLoading ? (
        <div className="h-56 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      ) : error ? (
        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{(error as Error).message}</p>
      ) : vacio ? (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">No hay datos en este período.</p>
      ) : data && conGrafico ? (
        <GraficoReporte resultado={ejemplo ?? data} enTarjeta />
      ) : data ? (
        <ListaCorta resultado={data} />
      ) : null}
    </>
  );
}

// Estado de los clientes según sus membresías (los mismos grupos de la ficha del cliente).
const GRUPOS_ESTADO = [
  { nombre: 'Al día', segmentos: ['ACTIVO_VIGENTE'], clase: 'bg-emerald-500' },
  { nombre: 'Por empezar', segmentos: ['ACTIVO_ENCOLADO'], clase: 'bg-indigo-500' },
  { nombre: 'Vencida', segmentos: ['INACTIVO_VENCIDO_RECIENTE', 'INACTIVO_ABANDONO_TEMPRANO', 'INACTIVO_CHURN'], clase: 'bg-amber-500' },
  { nombre: 'Sin membresía', segmentos: ['PROSPECTO'], clase: 'bg-slate-400 dark:bg-slate-500' },
];

/** Barra apilada de los clientes por estado (decisión I6: en vez de la torta). */
function TarjetaEstadoClientes() {
  const { token } = useAuth();
  const { activeTenantId } = useTenantStore();
  const { data: real } = useQuery({
    queryKey: ['dashboard-segmentacion', activeTenantId],
    queryFn: () => apiGet<{ total: number; porSegmento: Record<string, number> }>('/dashboard/segmentacion-clientes'),
    enabled: !!token,
  });
  const ejemplo = useEsEjemplo() && !!real && real.total === 0;
  const data = ejemplo ? ESTADO_CLIENTES_EJEMPLO : real;
  const grupos = GRUPOS_ESTADO.map((g) => ({ ...g, cantidad: g.segmentos.reduce((s, x) => s + (data?.porSegmento[x] ?? 0), 0) }));
  const total = data?.total ?? 0;
  const porcentaje = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Estado de los clientes</h3>
            {ejemplo && <MarcaEjemplo />}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Según sus membresías, de {total.toLocaleString('es-ES')} registrados.</p>
        </div>
        <Link href="/dashboard/clientes" className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10">
          Ver clientes <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      {!data ? (
        <div className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      ) : total === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Todavía no hay clientes.</p>
      ) : (
        <>
          {/* Una barra con las partes separadas por 2 px del fondo de la tarjeta. */}
          <div className="flex h-5 w-full gap-0.5 overflow-hidden rounded-md" role="img" aria-label={grupos.map((g) => `${g.nombre}: ${g.cantidad}`).join(', ')}>
            {grupos
              .filter((g) => g.cantidad > 0)
              .map((g) => (
                <div key={g.nombre} className={`${g.clase} h-full first:rounded-l-md last:rounded-r-md`} style={{ width: `${(g.cantidad / total) * 100}%` }} title={`${g.nombre}: ${g.cantidad}`} />
              ))}
          </div>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            {grupos.map((g) => (
              <li key={g.nombre} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${g.clase}`} aria-hidden />
                <span className="text-slate-600 dark:text-slate-300">{g.nombre}</span>
                <span className="ml-auto font-semibold tabular-nums text-slate-900 dark:text-white">{g.cantidad.toLocaleString('es-ES')}</span>
                <span className="w-9 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">{porcentaje(g.cantidad)} %</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** El contenido de una tarjeta, si esta persona la puede ver (permiso, módulo del gimnasio). */
function useContenido() {
  const { hasPermission } = usePermissions();
  const verReportes = hasPermission('reportes:leer');
  const { token } = useAuth();
  const { activeTenantId } = useTenantStore();
  // Todos los reportes que ve (plantillas, suyos y compartidos): para las
  // tarjetas, sus nombres y la galería.
  const { data: reportes } = useQuery({
    queryKey: ['inicio-reportes', activeTenantId],
    queryFn: () => apiGet<ReporteGuardado[]>('/reporteria/reportes'),
    enabled: !!token && verReportes,
  });
  const porId = new Map((reportes ?? []).map((r) => [r.id, r]));
  const porClave = new Map((reportes ?? []).filter((r) => r.clavePlantilla).map((r) => [r.clavePlantilla!, r]));
  const reporteDe = (id: string) => (id.startsWith('plantilla:') ? porClave.get(id.slice('plantilla:'.length)) : id.startsWith('reporte:') ? porId.get(id.slice('reporte:'.length)) : undefined);

  const contenido = (t: TarjetaTablero): React.ReactNode => {
    if (t.id === 'estado-clientes') return hasPermission('clientes:leer') ? <TarjetaEstadoClientes /> : null;
    if (t.id === 'por-vencer') return hasPermission('membresias:leer') ? <PorVencer limite={8} enTarjeta /> : null;
    if (!verReportes) return null;
    const r = reporteDe(t.id);
    // Un reporte guardado que no está en la lista (todavía cargando) se pide igual.
    const id = r?.id ?? (t.id.startsWith('reporte:') && reportes === undefined ? t.id.slice('reporte:'.length) : null);
    return id ? <TarjetaReporte key={`${t.id}-${t.rango ?? ''}`} reporteId={id} nombre={r?.nombre} rangoInicial={t.rango} /> : null;
  };
  const nombre = (t: TarjetaTablero) => TARJETAS_PROPIAS.find((x) => x.id === t.id)?.nombre ?? reporteDe(t.id)?.nombre ?? 'Tarjeta';
  return { contenido, nombre, reportes: reportes ?? [], hasPermission, esReporte: (t: TarjetaTablero) => !TARJETAS_PROPIAS.some((x) => x.id === t.id) };
}

// Lo que se anuncia al arrastrar (dnd-kit los trae en inglés).
const ANUNCIOS = {
  onDragStart: () => 'Moviendo la tarjeta.',
  onDragOver: () => undefined,
  onDragEnd: ({ over }: { over: unknown }) => (over ? 'Tarjeta movida.' : 'La tarjeta quedó donde estaba.'),
  onDragCancel: () => 'La tarjeta quedó donde estaba.',
};

const claseBotonIcono =
  'inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-slate-900 disabled:pointer-events-none disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white';

/** Una tarjeta mientras se personaliza: se arrastra, se mueve con flechas, cambia de tamaño y período, o se quita. */
function TarjetaEditable({
  t,
  nombre,
  contenido,
  primera,
  ultima,
  conPeriodo,
  conTamano,
  onCambiar,
  onMover,
  onQuitar,
}: {
  t: TarjetaTablero;
  nombre: string;
  contenido: React.ReactNode;
  primera: boolean;
  ultima: boolean;
  conPeriodo: boolean;
  /** En modo simple no se eligen tamaños: se acomodan solos. */
  conTamano: boolean;
  onCambiar: (cambios: Partial<TarjetaTablero>) => void;
  onMover: (paso: -1 | 1) => void;
  onQuitar: () => void;
}) {
  const { listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: t.id });
  return (
    <section
      ref={setNodeRef}
      data-tarjeta={t.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`${claseTarjeta} ${CLASE_TAMANO[t.tamano]} ring-2 ring-indigo-200 dark:ring-indigo-500/30 ${isDragging ? 'relative z-10 opacity-90 shadow-xl' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...listeners}
          // Solo para el mouse o el dedo: con el teclado se usan las flechas.
          tabIndex={-1}
          aria-hidden
          title="Arrastrar para mover"
          className={`${claseBotonIcono} cursor-grab touch-none active:cursor-grabbing`}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
        <span className="min-w-0 flex-1 truncate px-1 text-xs font-semibold text-slate-700 dark:text-slate-200">{nombre}</span>
        <button type="button" className={claseBotonIcono} disabled={primera} onClick={() => onMover(-1)} aria-label={`Mover antes: ${nombre}`} title="Mover antes">
          <ArrowUp className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" className={claseBotonIcono} disabled={ultima} onClick={() => onMover(1)} aria-label={`Mover después: ${nombre}`} title="Mover después">
          <ArrowDown className="h-4 w-4" aria-hidden />
        </button>
        {conTamano && (
          <select aria-label={`Tamaño de ${nombre}`} className={claseSelector} value={t.tamano} onChange={(e) => onCambiar({ tamano: e.target.value as TamanoTarjeta })}>
            {(Object.keys(NOMBRE_TAMANO) as TamanoTarjeta[]).map((x) => (
              <option key={x} value={x}>
                {NOMBRE_TAMANO[x]}
              </option>
            ))}
          </select>
        )}
        {conPeriodo && (
          <select aria-label={`Período de ${nombre}`} className={claseSelector} value={t.rango ?? ''} onChange={(e) => onCambiar({ rango: (e.target.value || undefined) as RangoFecha | undefined })}>
            <option value="">El del reporte</option>
            {RANGOS_TARJETA.map((r) => (
              <option key={r} value={r}>
                {NOMBRE_RANGO[r]}
              </option>
            ))}
          </select>
        )}
        <button type="button" className={`${claseBotonIcono} hover:text-rose-600 dark:hover:text-rose-400`} onClick={onQuitar} aria-label={`Quitar: ${nombre}`} title="Quitar">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {/* Mientras se personaliza, la tarjeta se ve pero no se toca. */}
      <div className="pointer-events-none select-none" aria-hidden>
        {contenido ?? <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Esta tarjeta no se puede mostrar (falta un permiso o el reporte ya no está).</p>}
      </div>
    </section>
  );
}

/** El tablero de tarjetas del Inicio, con el diseño guardado (o el sugerido), y su personalización. */
export function Tablero() {
  const { token, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { contenido, nombre, reportes, hasPermission, esReporte } = useContenido();
  const puedePersonalizar = hasPermission('organizaciones:actualizar');
  // Modo simple (decisión I7): el mismo tablero, sin tamaños ni reportes guardados.
  const { esSimple } = useModoUso();
  const { data: org } = useQuery({
    queryKey: ['organizacion'],
    queryFn: () => apiGet<{ configuracion?: { tablero?: { tarjetas?: TarjetaTablero[] | null }; onboarding?: { tipoGimnasio?: string } } | null }>('/organizaciones/me/info'),
    enabled: !!token && !isSuperAdmin,
  });
  const modulos = useModulosActivos();
  // Sin diseño guardado, el sugerido para este gimnasio y esta persona.
  const sugerido = disenoSugerido({
    modulos,
    tipoGimnasio: org?.configuracion?.onboarding?.tipoGimnasio,
    administra: puedePersonalizar,
    disponible: (id) => contenido({ id, tamano: 'mediana' }) !== null,
  });
  const guardadas = org?.configuracion?.tablero?.tarjetas ?? sugerido;

  // Personalizando: la lista en edición (null = viendo el Inicio).
  const [edicion, setEdicion] = useState<TarjetaTablero[] | null>(null);
  // "Volver al diseño sugerido" sin otros cambios: se guarda como "sin diseño".
  const [restablecido, setRestablecido] = useState(false);
  const [galeria, setGaleria] = useState(false);
  const cambiar = (lista: TarjetaTablero[]) => {
    setEdicion(lista);
    setRestablecido(false);
  };

  const guardar = useMutation({
    mutationFn: (tarjetas: TarjetaTablero[] | null) => apiPut('/organizaciones/me/info', { configuracion: { tablero: { tarjetas } } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizacion'] });
      setEdicion(null);
      toast({ title: 'Inicio guardado', description: 'Así lo va a ver todo el equipo (cada uno, con lo que tiene permiso de ver).', variant: 'success' });
    },
    onError: (e: Error) => toast({ title: 'No se pudo guardar el Inicio', description: e.message, variant: 'destructive' }),
  });

  // Arrastrar es con el mouse o el dedo; con el teclado están las flechas de
  // cada tarjeta (el modo teclado de dnd-kit no movía tarjetas tan altas).
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const alSoltar = ({ active, over }: DragEndEvent) => {
    if (!edicion || !over || active.id === over.id) return;
    cambiar(arrayMove(edicion, edicion.findIndex((t) => t.id === active.id), edicion.findIndex((t) => t.id === over.id)));
  };

  if (edicion) {
    const opciones = opcionesGaleria(reportes, hasPermission);
    return (
      <div className="space-y-4">
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50/95 p-3 shadow-sm backdrop-blur dark:border-indigo-500/30 dark:bg-slate-900/95">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Personalizando el Inicio</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">Arrastra cada tarjeta desde sus puntitos o muévela con las flechas. Lo que guardes lo ve todo el equipo.</p>
          </div>
          <button
            type="button"
            onClick={() => setGaleria(true)}
            disabled={edicion.length >= MAX_TARJETAS}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Plus className="h-4 w-4" aria-hidden /> Agregar tarjeta
          </button>
          <button
            type="button"
            onClick={() => {
              setEdicion(sugerido);
              setRestablecido(true);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-4 w-4" aria-hidden /> Volver al diseño sugerido
          </button>
          <button type="button" onClick={() => setEdicion(null)} className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => guardar.mutate(restablecido ? null : esSimple ? emparejar(edicion) : edicion)}
            disabled={guardar.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
          >
            <Check className="h-4 w-4" aria-hidden /> {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>

        {edicion.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Tu Inicio no tiene tarjetas. Usa <strong>Agregar tarjeta</strong> para elegir gráficos y listas.
          </div>
        ) : (
          <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={alSoltar} accessibility={{ announcements: ANUNCIOS }}>
            <SortableContext items={edicion.map((t) => t.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-6 gap-4">
                {edicion.map((t, i) => (
                  <TarjetaEditable
                    key={t.id}
                    t={t}
                    nombre={nombre(t)}
                    contenido={contenido(t)}
                    primera={i === 0}
                    ultima={i === edicion.length - 1}
                    conPeriodo={esReporte(t)}
                    conTamano={!esSimple}
                    onCambiar={(c) => cambiar(edicion.map((x) => (x.id === t.id ? { ...x, ...c } : x)))}
                    onMover={(paso) => cambiar(arrayMove(edicion, i, i + paso))}
                    onQuitar={() => cambiar(edicion.filter((x) => x.id !== t.id))}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <GaleriaTarjetas
          abierta={galeria}
          onCerrar={() => setGaleria(false)}
          opciones={opciones}
          actuales={edicion.map((t) => t.id)}
          lleno={edicion.length >= MAX_TARJETAS}
          onAgregar={(t) => {
            cambiar([...edicion, t]);
            setGaleria(false);
            toast({ title: 'Tarjeta agregada', description: 'Quedó al final. Guarda para que se quede.', variant: 'success' });
          }}
          vistaPrevia={(t) => contenido(t)}
          conTamano={!esSimple}
        />
      </div>
    );
  }

  const conContenido = guardadas.flatMap((t) => {
    const c = contenido(t);
    return c ? [{ t, contenido: c }] : [];
  });
  // En modo simple los tamaños se acomodan solos (sin huecos entre las que se ven).
  const tamanos = esSimple ? emparejar(conContenido.map((x) => x.t)) : conContenido.map((x) => x.t);
  const visibles = conContenido.map((x, i) => ({ ...x, t: tamanos[i] }));
  if (visibles.length === 0 && !puedePersonalizar) return null;

  return (
    <div className="space-y-4">
      {puedePersonalizar && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setEdicion(guardadas);
              setRestablecido(false);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden /> Personalizar el Inicio
          </button>
        </div>
      )}
      <div className="grid grid-cols-6 gap-4">
        {visibles.map(({ t, contenido }) => (
          // data-recorrido: el paso "Quién está por vencer" de la guía del modo simple.
          <section key={t.id} data-tarjeta={t.id} data-recorrido={t.id === 'por-vencer' ? 'por-vencer' : undefined} className={`${claseTarjeta} ${CLASE_TAMANO[t.tamano]}`}>
            {contenido}
          </section>
        ))}
      </div>
    </div>
  );
}
