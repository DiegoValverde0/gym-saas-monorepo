"use client";

import { Ayuda } from '@/components/ui/ayuda';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useModoUso } from '@/hooks/use-modo-uso';
import { useSucursalActiva } from '@/hooks/use-sucursal-activa';
import { usePermissions } from '@/hooks/use-permissions';
import { apiGet, apiPost, apiPut, unwrapList } from '@/lib/api-client';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  DIAS_CORTOS, Disciplina, ORDEN_SEMANA, SerieClase, dateInputClass, describirHorario, fechaDe, horaDe, hhmm, minutosDeHora,
} from './compartido';

interface OpcionEntrenador { id: string; nombre: string; imparteDisciplina: boolean | null }
interface Tramo { diaSemana: number; desde: number; hasta: number; nombre?: string; instructor?: string | null; sucursal?: string }
interface Horarios { trabajo: Tramo[]; ocupado: Tramo[]; sucursal: Tramo[] }
interface Plan { id: string; nombre: string; estado: string }
type ModoAcceso = 'ABIERTA' | 'MIEMBROS' | 'PLANES';
interface AccesoClases { porDefecto: ModoAcceso; porDisciplina: Record<string, { modo: ModoAcceso; planIds?: string[] }> }
interface Seleccion { dia: number; inicio: number }

const DURACIONES = [30, 45, 60, 90];
const PRIMERA_HORA = 6 * 60;
const ULTIMA_HORA = 22 * 60;
const PASO_GRILLA = 30;
// Semanas que se generan por adelantado si la organización no eligió otro valor (plan 8.6).
const SEMANAS_PROYECCION_DEFAULT = 8;

// Prellenado desde la Agenda o un clic en el calendario.
export interface InicioAsistente {
  sucursalId?: string;
  sucursalFija?: boolean;
  fecha?: Date;
}

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Sesiones que se programarán en las próximas semanas (para el resumen).
function contarSesiones(selecciones: Seleccion[], desde: string, semanas: number) {
  const inicio = new Date(`${desde}T00:00:00`);
  let total = 0;
  for (let i = 0; i < semanas * 7; i++) {
    const d = new Date(inicio.getTime() + i * 86400000);
    total += selecciones.filter((s) => s.dia === d.getDay()).length;
  }
  return total;
}

/**
 * Asistente "Nueva clase" (plan de simplificación, 8.2): qué clase, dónde y
 * con quién, cuándo (grilla con la disponibilidad del instructor), quién puede
 * reservar y resumen. En modo simple, los pasos 1 a 3 van en una sola pantalla
 * y quién reserva queda en "cualquier miembro activo".
 */
export function NuevaClaseWizard({
  open,
  onOpenChange,
  series,
  editarSerie,
  inicio,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  series: SerieClase[];
  editarSerie?: SerieClase | null;
  inicio?: InicioAsistente | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { modo, esSimple } = useModoUso();
  const { sucursalId: sucursalActiva, sucursales, puedeElegir } = useSucursalActiva();

  const [paso, setPaso] = useState(1);
  const [disciplinaId, setDisciplinaId] = useState('');
  const [nombre, setNombre] = useState('');
  const [duracion, setDuracion] = useState(60);
  const [otraDuracion, setOtraDuracion] = useState(false);
  const [cupo, setCupo] = useState(20);
  const [sucursalId, setSucursalId] = useState('');
  const [entrenadorId, setEntrenadorId] = useState('');
  // Fase 6 (DB-2): sala opcional; el selector solo aparece si la sucursal tiene salas.
  const [salaId, setSalaId] = useState('');
  const [esUnica, setEsUnica] = useState(false);
  const [fechaUnica, setFechaUnica] = useState('');
  const [selecciones, setSelecciones] = useState<Seleccion[]>([]);
  const [vigenciaDesde, setVigenciaDesde] = useState(hoyISO());
  const [vigenciaHasta, setVigenciaHasta] = useState('');
  const [masOpciones, setMasOpciones] = useState(false);
  const [modoAcceso, setModoAcceso] = useState<ModoAcceso>('MIEMBROS');
  const [planesAcceso, setPlanesAcceso] = useState<string[]>([]);
  const [accesoTocado, setAccesoTocado] = useState(false);
  // Fase 6 (DB-1, experto): la regla vale solo para esta clase y no para toda la disciplina.
  const [soloEstaClase, setSoloEstaClase] = useState(false);
  const reglaPropia = modo === 'experto' && soloEstaClase;

  const { data: disciplinas = [] } = useQuery({
    queryKey: ['disciplinas', 'asistente'],
    queryFn: async () => unwrapList<Disciplina>(await apiGet('/disciplinas')),
    enabled: open,
  });
  const { data: planes = [] } = useQuery({
    queryKey: ['planes', 'asistente'],
    queryFn: async () => unwrapList<Plan>(await apiGet('/planes')),
    enabled: open && !esSimple,
  });
  const { data: acceso } = useQuery({
    queryKey: ['acceso-clases'],
    queryFn: async () => apiGet<AccesoClases>('/acceso-clases'),
    enabled: open && !esSimple,
  });
  const { data: organizacion } = useQuery({
    queryKey: ['organizacion'],
    queryFn: async () => apiGet<{ configuracion?: { requerimientosClase?: { exigirTurnoEntrenador?: boolean } } }>('/organizaciones/me/info'),
    enabled: open,
  });
  const reglaEstricta = organizacion?.configuracion?.requerimientosClase?.exigirTurnoEntrenador === true;

  // ---- Estado inicial al abrir
  useEffect(() => {
    if (!open) return;
    setPaso(1);
    setMasOpciones(false);
    setAccesoTocado(false);
    if (editarSerie) {
      const b = editarSerie.base;
      setDisciplinaId(b.disciplinaId ?? '');
      setNombre(b.nombreClase);
      setDuracion(b.duracionMinutos);
      setOtraDuracion(!DURACIONES.includes(b.duracionMinutos));
      setCupo(b.capacidadMaxima);
      setSucursalId(b.sucursalId);
      setEntrenadorId(b.entrenadorId ?? '');
      setSalaId(b.salaId ?? '');
      setSoloEstaClase(!!b.acceso);
      if (b.acceso) {
        setModoAcceso(b.acceso);
        setPlanesAcceso((b.planesAcceso ?? []).map((x) => x.planId));
      }
      setEsUnica(false);
      setSelecciones(editarSerie.dias.map((dia) => ({ dia, inicio: minutosDeHora(horaDe(b.horaInicio)) })));
      setVigenciaDesde(fechaDe(b.vigenciaDesde));
      setVigenciaHasta(fechaDe(b.vigenciaHasta));
      return;
    }
    setDisciplinaId('');
    setNombre('');
    setDuracion(60);
    setOtraDuracion(false);
    setCupo(20);
    setSucursalId(inicio?.sucursalId || sucursalActiva || '');
    setEntrenadorId('');
    setSalaId('');
    setSoloEstaClase(false);
    setEsUnica(false);
    setFechaUnica('');
    setVigenciaDesde(hoyISO());
    setVigenciaHasta('');
    // Un clic en el calendario o en la Agenda deja marcado ese día y hora.
    if (inicio?.fecha) {
      const f = inicio.fecha;
      const min = f.getHours() * 60 + f.getMinutes();
      setSelecciones([{ dia: f.getDay(), inicio: Math.round(min / PASO_GRILLA) * PASO_GRILLA }]);
    } else {
      setSelecciones([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editarSerie, inicio]);

  // Regla de quién reserva de la disciplina elegida.
  useEffect(() => {
    if (!acceso || accesoTocado || soloEstaClase) return;
    const regla = (disciplinaId && acceso.porDisciplina[disciplinaId]) || { modo: acceso.porDefecto };
    setModoAcceso(regla.modo);
    setPlanesAcceso(regla.modo === 'PLANES' ? regla.planIds ?? [] : []);
  }, [acceso, disciplinaId, accesoTocado, soloEstaClase]);

  // "Nueva disciplina" sin salir del asistente (plan 11.11): en modo simple
  // no existe la pantalla de Disciplinas.
  const { hasPermission } = usePermissions();
  const [nuevaDisciplina, setNuevaDisciplina] = useState<string | null>(null);
  const crearDisciplina = useMutation({
    mutationFn: async (nombreDisciplina: string) => apiPost<Disciplina>('/disciplinas', { nombre: nombreDisciplina }),
    onSuccess: async (d) => {
      await queryClient.invalidateQueries({ queryKey: ['disciplinas'] });
      setNuevaDisciplina(null);
      setDisciplinaId(d.id);
      if (!nombre) setNombre(d.nombre);
    },
    onError: (err: Error) => toast({ title: 'No se pudo crear la disciplina', description: err.message, variant: 'destructive' }),
  });

  const elegirDisciplina = (id: string) => {
    setDisciplinaId(id);
    const d = disciplinas.find((x) => x.id === id);
    if (d && (!nombre || disciplinas.some((x) => x.nombre === nombre))) setNombre(d.nombre);
    // Cupo por defecto: el último usado para esa disciplina.
    const ultima = series.filter((s) => s.base.disciplinaId === id).at(-1);
    if (ultima && !editarSerie) setCupo(ultima.base.capacidadMaxima);
    setEntrenadorId('');
  };

  // ---- Paso 2: instructores que imparten la disciplina en esa sucursal
  const { data: entrenadores = [] } = useQuery({
    queryKey: ['clases-entrenadores', 'asistente', sucursalId, disciplinaId],
    queryFn: async () =>
      apiGet<OpcionEntrenador[]>(`/clases/entrenadores?${new URLSearchParams({ sucursalId, ...(disciplinaId ? { disciplinaId } : {}) })}`),
    enabled: open && !!sucursalId,
  });
  const entrenadoresDeLaDisciplina = disciplinaId ? entrenadores.filter((e) => e.imparteDisciplina) : entrenadores;
  const listaEntrenadores = entrenadoresDeLaDisciplina.length > 0 ? entrenadoresDeLaDisciplina : entrenadores;
  const { data: salas = [] } = useQuery({
    queryKey: ['salas', sucursalId],
    queryFn: async () => apiGet<{ id: string; nombre: string; capacidad: number | null }[]>(`/salas?sucursalId=${sucursalId}`),
    enabled: open && !!sucursalId,
  });

  // ---- Paso 3: grilla
  const { data: horarios } = useQuery({
    queryKey: ['clases-horarios', sucursalId, entrenadorId, salaId, editarSerie?.ids.join(',')],
    queryFn: async () =>
      apiGet<Horarios>(
        `/clases/horarios-disponibles?${new URLSearchParams({
          sucursalId,
          ...(entrenadorId ? { entrenadorId } : {}),
          ...(salaId ? { salaId } : {}),
          ...(editarSerie ? { excluirIds: editarSerie.ids.join(',') } : {}),
        })}`,
      ),
    enabled: open && !!sucursalId,
  });

  const filas = useMemo(() => {
    const r: number[] = [];
    for (let m = PRIMERA_HORA; m + duracion <= ULTIMA_HORA + 60; m += PASO_GRILLA) r.push(m);
    return r;
  }, [duracion]);

  const solapa = (t: Tramo, dia: number, ini: number) => t.diaSemana === dia && ini < t.hasta && t.desde < ini + duracion;
  const estadoCelda = (dia: number, ini: number): 'rojo' | 'verde' | 'amarillo' | 'libre' => {
    if (!horarios) return 'libre';
    if (horarios.ocupado.some((t) => solapa(t, dia, ini))) return 'rojo';
    if (!entrenadorId) return 'libre';
    return horarios.trabajo.some((t) => t.diaSemana === dia && t.desde <= ini && t.hasta >= ini + duracion) ? 'verde' : 'amarillo';
  };
  const referenciaSucursal = (dia: number, ini: number) => horarios?.sucursal.find((t) => solapa(t, dia, ini));
  const cubre = (dia: number, fila: number) => selecciones.some((s) => s.dia === dia && fila >= s.inicio && fila < s.inicio + duracion);

  const alternarCelda = (dia: number, ini: number) => {
    const estado = estadoCelda(dia, ini);
    if (estado === 'rojo') {
      const choque = horarios?.ocupado.find((t) => solapa(t, dia, ini));
      toast({ title: 'Horario ocupado', description: `Ese horario choca con ${choque?.nombre ?? 'otra clase'}${choque?.sucursal ? ` (${choque.sucursal})` : ''}.`, variant: 'destructive' });
      return;
    }
    if (estado === 'amarillo' && reglaEstricta) {
      toast({ title: 'Fuera de su horario', description: 'Tu gimnasio exige que la clase esté dentro del horario de trabajo del instructor.', variant: 'destructive' });
      return;
    }
    const existe = selecciones.find((s) => s.dia === dia && s.inicio === ini);
    if (existe) {
      setSelecciones(selecciones.filter((s) => s !== existe));
      return;
    }
    // Una clase recurrente tiene una sola hora: al editar, elegir otra hora la reemplaza.
    const base = editarSerie ? selecciones.filter((s) => s.inicio === ini) : selecciones;
    setSelecciones([...base.filter((s) => s.dia !== dia), { dia, inicio: ini }]);
  };

  // Resumen en palabras, agrupado por hora.
  const grupos = useMemo(() => {
    const porHora = new Map<number, number[]>();
    for (const s of selecciones) porHora.set(s.inicio, [...(porHora.get(s.inicio) ?? []), s.dia]);
    return [...porHora.entries()].sort((a, b) => a[0] - b[0]);
  }, [selecciones]);
  const resumenHorario = esUnica
    ? fechaUnica
      ? new Date(fechaUnica).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
      : ''
    : grupos.map(([ini, dias]) => describirHorario(dias, ini, duracion)).join('; ');

  // ---- Validación por paso
  const errorPaso = (p: number): string | null => {
    if (p === 1) {
      if (!nombre.trim()) return 'Ponle un nombre a la clase.';
      if (!duracion || duracion < 10) return 'Indica la duración.';
      if (!cupo || cupo < 1) return 'Indica el cupo.';
    }
    if (p === 2 && !sucursalId) return 'Elige la sucursal.';
    if (p === 3) {
      if (esUnica && !fechaUnica) return 'Elige la fecha y hora de la clase.';
      if (!esUnica && selecciones.length === 0) return 'Marca en la grilla al menos un día y hora.';
    }
    if (p === 4 && modoAcceso === 'PLANES' && planesAcceso.length === 0) return 'Elige al menos un plan.';
    if (p === 4 && reglaPropia && esUnica && modoAcceso === 'PLANES') return 'Una clase única no puede limitarse a ciertos planes: usa la regla de la disciplina o créala como recurrente.';
    return null;
  };

  const guardar = useMutation({
    mutationFn: async () => {
      const base = {
        sucursalId,
        disciplinaId: disciplinaId || null,
        entrenadorId: entrenadorId || null,
        salaId: salaId || null,
        acceso: reglaPropia ? modoAcceso : null,
        nombreClase: nombre.trim(),
        capacidadMaxima: Number(cupo),
        duracionMinutos: Number(duracion),
      };
      let sesiones = 0;
      if (esUnica) {
        await apiPost('/clases', { ...base, disciplinaId: base.disciplinaId ?? undefined, entrenadorId: base.entrenadorId ?? undefined, salaId: base.salaId ?? undefined, acceso: base.acceso ?? undefined, fechaHora: new Date(fechaUnica).toISOString() });
        sesiones = 1;
      } else {
        const serieBase = { ...base, vigenciaDesde, vigenciaHasta: vigenciaHasta || null, activa: editarSerie ? editarSerie.base.activa : true };
        for (const [i, [ini, dias]] of grupos.entries()) {
          const cuerpo = { ...serieBase, horaInicio: hhmm(ini), diasSemana: dias, planIds: reglaPropia && modoAcceso === 'PLANES' ? planesAcceso : [] };
          const r =
            editarSerie && i === 0
              ? await apiPut<{ clasesCreadas?: number }>('/clases-plantilla/serie', { ...cuerpo, ids: editarSerie.ids })
              : await apiPost<{ clasesCreadas?: number }>('/clases-plantilla/serie', cuerpo);
          sesiones += r?.clasesCreadas ?? 0;
        }
      }
      // Quién puede reservar: la regla de la disciplina (vale para todas sus
      // clases), salvo que en experto se haya elegido "solo esta clase".
      if (accesoTocado && disciplinaId && !reglaPropia) {
        await apiPut(`/acceso-clases/disciplinas/${disciplinaId}`, modoAcceso === 'PLANES' ? { modo: modoAcceso, planIds: planesAcceso } : { modo: modoAcceso });
      }
      return sesiones;
    },
    onSuccess: (sesiones) => {
      queryClient.invalidateQueries({ queryKey: ['clases'] });
      queryClient.invalidateQueries({ queryKey: ['clases-plantilla'] });
      queryClient.invalidateQueries({ queryKey: ['clases-horarios'] });
      queryClient.invalidateQueries({ queryKey: ['acceso-clases'] });
      queryClient.invalidateQueries({ queryKey: ['agenda'] });
      toast({
        title: editarSerie ? 'Clase actualizada' : 'Clase creada',
        description: esUnica ? 'La clase quedó programada.' : sesiones ? `Se programaron ${sesiones} sesiones nuevas.` : 'Los cambios se aplicaron a las sesiones futuras.',
        variant: 'success',
      });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: 'No se pudo guardar', description: err.message, variant: 'destructive' }),
  });

  // ---- Pasos visibles según el modo
  const pasos = esSimple ? [1] : [1, 2, 3, 4, 5];
  const ultimo = pasos[pasos.length - 1];
  const TITULOS: Record<number, string> = { 1: '¿Qué clase?', 2: '¿Dónde y con quién?', 3: '¿Cuándo?', 4: '¿Quién puede reservar?', 5: 'Resumen' };
  const siguiente = () => {
    const error = esSimple ? errorPaso(1) ?? errorPaso(2) ?? errorPaso(3) : errorPaso(paso);
    if (error) {
      toast({ title: 'Falta un dato', description: error, variant: 'destructive' });
      return;
    }
    if (paso === ultimo) guardar.mutate();
    else setPaso(paso + 1);
  };

  const botonOpcion = (activo: boolean) =>
    `rounded-lg border px-3 py-2 text-sm transition-colors ${activo ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-900 dark:text-indigo-100 font-semibold' : 'border-zinc-200 dark:border-zinc-800 hover:border-indigo-300'}`;
  const etiqueta = 'text-sm font-medium text-zinc-700 dark:text-zinc-300';
  const disciplinaElegida = disciplinas.find((d) => d.id === disciplinaId);
  const entrenadorElegido = listaEntrenadores.find((e) => e.id === entrenadorId) ?? entrenadores.find((e) => e.id === entrenadorId);
  const sucursalElegida = sucursales.find((s) => s.id === sucursalId);

  // ================= Pasos =================
  const paso1 = (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className={etiqueta} htmlFor="clase-disciplina">Disciplina</label>
        {nuevaDisciplina === null ? (
          <>
            <select id="clase-disciplina" value={disciplinaId} onChange={(e) => elegirDisciplina(e.target.value)} className={dateInputClass}>
              <option value="">Sin disciplina</option>
              {disciplinas.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
            {hasPermission('disciplinas:crear') && (
              <button type="button" onClick={() => setNuevaDisciplina('')} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                + Nueva disciplina
              </button>
            )}
          </>
        ) : (
          <div className="flex gap-2">
            <Input autoFocus value={nuevaDisciplina} onChange={(e) => setNuevaDisciplina(e.target.value)} placeholder="Ej. Spinning" aria-label="Nombre de la nueva disciplina" />
            <Button type="button" onClick={() => crearDisciplina.mutate(nuevaDisciplina.trim())} disabled={nuevaDisciplina.trim().length < 2 || crearDisciplina.isPending}>Crear</Button>
            <Button type="button" variant="ghost" onClick={() => setNuevaDisciplina(null)}>Cancelar</Button>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <label className={etiqueta} htmlFor="clase-nombre">Nombre</label>
        <Input id="clase-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Spinning" />
      </div>
      <div className="space-y-2">
        <p className={etiqueta}>Duración</p>
        <div className="flex flex-wrap gap-2">
          {DURACIONES.map((m) => (
            <button key={m} type="button" className={botonOpcion(!otraDuracion && duracion === m)} onClick={() => { setOtraDuracion(false); setDuracion(m); }}>{m} min</button>
          ))}
          <button type="button" className={botonOpcion(otraDuracion)} onClick={() => setOtraDuracion(true)}>Otra</button>
          {otraDuracion && (
            <Input type="number" min={10} step={5} value={duracion} onChange={(e) => setDuracion(Number(e.target.value))} className="w-24" aria-label="Duración en minutos" />
          )}
        </div>
      </div>
      <div className="space-y-2">
        <label className={etiqueta} htmlFor="clase-cupo">Cupo</label>
        <Input id="clase-cupo" type="number" min={1} value={cupo} onChange={(e) => setCupo(Number(e.target.value))} className="w-28" />
      </div>
    </div>
  );

  const paso2 = (
    <div className="space-y-4">
      {puedeElegir && !inicio?.sucursalFija && !editarSerie ? (
        <div className="space-y-2">
          <label className={etiqueta} htmlFor="clase-sucursal">Sucursal</label>
          <select id="clase-sucursal" value={sucursalId} onChange={(e) => { setSucursalId(e.target.value); setEntrenadorId(''); setSalaId(''); }} className={dateInputClass}>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
      ) : sucursales.length > 1 && sucursalElegida ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Sucursal: <span className="font-semibold">{sucursalElegida.nombre}</span></p>
      ) : null}
      {salas.length > 0 && (
        <div className="space-y-2">
          <label className={etiqueta} htmlFor="clase-sala">Sala</label>
          <select
            id="clase-sala"
            value={salaId}
            onChange={(e) => {
              setSalaId(e.target.value);
              const sala = salas.find((s) => s.id === e.target.value);
              if (sala?.capacidad && !editarSerie) setCupo(sala.capacidad);
            }}
            className={dateInputClass}
          >
            <option value="">Sin sala</option>
            {salas.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.capacidad ? ` (${s.capacidad} personas)` : ''}</option>)}
          </select>
          <p className="text-xs text-zinc-500">Si eliges una sala, la grilla marca en rojo los horarios en que ya tiene otra clase.</p>
        </div>
      )}
      <div className="space-y-2">
        <p className={etiqueta}>Instructor</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button type="button" className={botonOpcion(!entrenadorId)} onClick={() => setEntrenadorId('')}>Sin instructor por ahora</button>
          {listaEntrenadores.map((e) => (
            <button key={e.id} type="button" className={botonOpcion(entrenadorId === e.id)} onClick={() => setEntrenadorId(e.id)}>{e.nombre}</button>
          ))}
        </div>
        {disciplinaId && entrenadoresDeLaDisciplina.length === 0 && entrenadores.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300">Nadie del equipo tiene marcada esta disciplina: se muestran todos.</p>
        )}
      </div>
    </div>
  );

  const COLOR: Record<string, string> = {
    verde: 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20',
    amarillo: 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/20',
    rojo: 'bg-rose-100 dark:bg-rose-500/25 cursor-not-allowed',
    libre: 'bg-white hover:bg-indigo-50 dark:bg-slate-900 dark:hover:bg-indigo-500/10',
  };

  const paso3 = (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
        <Checkbox checked={esUnica} onCheckedChange={(c) => setEsUnica(!!c)} disabled={!!editarSerie} />
        Es una clase única (no se repite)
      </label>
      {esUnica ? (
        <div className="space-y-2 max-w-xs">
          <label className={etiqueta} htmlFor="clase-fecha">Fecha y hora</label>
          <input id="clase-fecha" type="datetime-local" value={fechaUnica} onChange={(e) => setFechaUnica(e.target.value)} className={dateInputClass} />
        </div>
      ) : (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Toca la hora de inicio en cada día.{entrenadorId ? ' Verde: trabaja y está libre. Amarillo: libre pero fuera de su horario. Rojo: ya da otra clase.' : ''} En gris, otras clases de la sucursal.
          </p>
          <div className="max-h-[340px] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th className="w-12 p-1" />
                  {ORDEN_SEMANA.map((d) => <th key={d} className="p-1 font-semibold text-zinc-600 dark:text-zinc-300">{DIAS_CORTOS[d]}</th>)}
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila}>
                    <td className="p-1 text-right text-zinc-400 align-top">{fila % 60 === 0 ? hhmm(fila) : ''}</td>
                    {ORDEN_SEMANA.map((dia) => {
                      const estado = estadoCelda(dia, fila);
                      const elegida = selecciones.some((s) => s.dia === dia && s.inicio === fila);
                      const cubierta = cubre(dia, fila);
                      const ref = referenciaSucursal(dia, fila);
                      return (
                        <td key={dia} className="p-0 border-t border-l border-zinc-100 dark:border-zinc-800">
                          <button
                            type="button"
                            onClick={() => alternarCelda(dia, fila)}
                            title={ref ? `${ref.nombre}${ref.instructor ? ` · ${ref.instructor}` : ''}` : `${DIAS_CORTOS[dia]} ${hhmm(fila)}`}
                            aria-label={`${DIAS_CORTOS[dia]} ${hhmm(fila)}`}
                            aria-pressed={elegida}
                            className={`h-6 w-full min-w-[36px] ${cubierta ? 'bg-indigo-500 text-white' : COLOR[estado]} ${ref && !cubierta ? 'bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(100,116,139,0.18)_4px,rgba(100,116,139,0.18)_8px)]' : ''}`}
                          >
                            {elegida ? hhmm(fila) : ''}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {resumenHorario && <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">{resumenHorario}</p>}
        </>
      )}
      {!esUnica && !esSimple && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
          <button type="button" onClick={() => setMasOpciones(!masOpciones)} className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300" aria-expanded={masOpciones}>
            <span>Más opciones: vigencia</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${masOpciones ? 'rotate-180' : ''}`} />
          </button>
          {masOpciones && (
            <div className="grid grid-cols-2 gap-3 px-3 pb-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-500" htmlFor="vig-desde">Desde</label>
                <input id="vig-desde" type="date" value={vigenciaDesde} onChange={(e) => setVigenciaDesde(e.target.value)} className={dateInputClass} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500" htmlFor="vig-hasta">Hasta (opcional)</label>
                <input id="vig-hasta" type="date" value={vigenciaHasta} onChange={(e) => setVigenciaHasta(e.target.value)} className={dateInputClass} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const planesActivos = planes.filter((p) => p.estado === 'ACTIVO');
  const opcionesAcceso = (
    <>
      {([
        ['MIEMBROS', 'Cualquier cliente con membresía activa'],
        ['PLANES', 'Solo ciertos planes'],
        ['ABIERTA', 'Abierta a todos, incluso sin membresía (clase de prueba, evento)'],
      ] as [ModoAcceso, string][]).map(([valor, texto]) => (
        <button key={valor} type="button" className={`w-full text-left ${botonOpcion(modoAcceso === valor)}`} onClick={() => { setModoAcceso(valor); setAccesoTocado(true); }}>{texto}</button>
      ))}
      {modoAcceso === 'PLANES' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-2">
          {planesActivos.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={planesAcceso.includes(p.id)}
                onCheckedChange={(c) => { setAccesoTocado(true); setPlanesAcceso(c ? [...planesAcceso, p.id] : planesAcceso.filter((x) => x !== p.id)); }}
              />
              {p.nombre}
            </label>
          ))}
        </div>
      )}
    </>
  );

  const paso4 = (
    <div className="space-y-3">
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">¿Quién puede reservar? <Ayuda tema="quienReserva" /></p>
      {modo === 'experto' && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="A qué se aplica la regla">
          {disciplinaId && (
            <button type="button" className={botonOpcion(!soloEstaClase)} onClick={() => { setSoloEstaClase(false); setAccesoTocado(false); }}>
              Toda la disciplina {disciplinaElegida?.nombre}
            </button>
          )}
          <button type="button" className={botonOpcion(reglaPropia)} onClick={() => { setSoloEstaClase(true); setAccesoTocado(true); }}>
            Solo esta clase
          </button>
        </div>
      )}
      {reglaPropia ? (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {disciplinaId
              ? 'Esta regla vale solo para esta clase; el resto de las clases de la disciplina siguen con la suya.'
              : 'Esta regla vale solo para esta clase; las demás siguen con la regla general.'}
          </p>
          {opcionesAcceso}
        </>
      ) : !disciplinaId ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          La clase no tiene disciplina, así que usa la regla general: puede reservar cualquier cliente con membresía activa.
        </p>
      ) : (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Esta regla es de la disciplina <span className="font-semibold">{disciplinaElegida?.nombre}</span>: vale para todas sus clases. También se puede cambiar desde cada plan.
          </p>
          {opcionesAcceso}
        </>
      )}
    </div>
  );

  const semanasProyeccion = Number((organizacion as { configuracion?: { clases?: { semanasProyeccion?: number } } } | undefined)?.configuracion?.clases?.semanasProyeccion) || SEMANAS_PROYECCION_DEFAULT;
  const sesionesPrevistas = esUnica ? 1 : contarSesiones(selecciones, vigenciaDesde, semanasProyeccion);
  const paso5 = (
    <div className="space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
      <p className="text-base">
        {esUnica ? 'Se programará ' : `Se programarán ${editarSerie ? 'hasta ' : ''}`}
        <span className="font-semibold">{esUnica ? '1 sesión' : `${sesionesPrevistas} sesiones`}</span> de <span className="font-semibold">{nombre}</span>
        {esUnica ? '' : ` en las próximas ${semanasProyeccion} semanas`}
        {sucursalElegida ? <> en <span className="font-semibold">{sucursalElegida.nombre}</span></> : null}
        {salas.find((s) => s.id === salaId) ? <> ({salas.find((s) => s.id === salaId)?.nombre})</> : null}
        {entrenadorElegido ? <> con <span className="font-semibold">{entrenadorElegido.nombre}</span></> : ' sin instructor por ahora'}.
      </p>
      <p>{resumenHorario} · {duracion} min · {cupo} cupos.</p>
      {!esUnica && <p className="text-xs text-zinc-500">Las siguientes se crean solas cada semana.</p>}
      {(reglaPropia || disciplinaId) && modo !== 'simple' && (
        <p className="text-xs text-zinc-500">
          Reservan: {modoAcceso === 'ABIERTA' ? 'todos, incluso sin membresía' : modoAcceso === 'MIEMBROS' ? 'cualquier cliente con membresía activa' : `solo ${planesActivos.filter((p) => planesAcceso.includes(p.id)).map((p) => p.nombre).join(', ')}`}.
        </p>
      )}
    </div>
  );

  const contenido: Record<number, ReactElement> = { 1: paso1, 2: paso2, 3: paso3, 4: paso4, 5: paso5 };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] p-0 overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <div>
            <DialogTitle className="text-xl">{editarSerie ? 'Editar toda la clase' : 'Nueva clase'}</DialogTitle>
            <DialogDescription className="mt-1">{esSimple ? 'Qué clase, con quién y cuándo.' : `Paso ${paso} de ${pasos.length}: ${TITULOS[paso]}`}</DialogDescription>
          </div>
          {!esSimple && (
            <div className="flex gap-2 shrink-0 pl-4">
              {pasos.map((s) => <div key={s} className={`w-3 h-3 rounded-full ${paso >= s ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`} />)}
            </div>
          )}
        </div>

        <div className="px-6 py-5 max-h-[65vh] overflow-y-auto space-y-6">
          {esSimple ? (
            <>
              {paso1}
              {paso2}
              {paso3}
            </>
          ) : (
            contenido[paso]
          )}
        </div>

        <div className="px-6 py-4 flex justify-between items-center border-t border-slate-200 dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={() => (paso > 1 && !esSimple ? setPaso(paso - 1) : onOpenChange(false))} disabled={guardar.isPending}>
            {paso > 1 && !esSimple ? <><ChevronLeft className="w-4 h-4 mr-1" /> Atrás</> : 'Cancelar'}
          </Button>
          <Button type="button" onClick={siguiente} disabled={guardar.isPending}>
            {paso === ultimo ? (guardar.isPending ? 'Guardando...' : editarSerie ? 'Guardar cambios' : 'Crear clase') : <>Siguiente <ChevronRight className="w-4 h-4 ml-1" /></>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
