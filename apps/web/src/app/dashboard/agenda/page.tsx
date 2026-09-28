"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useSucursalActiva } from '@/hooks/use-sucursal-activa';
import { usePermissions } from '@/hooks/use-permissions';
import { apiGet } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CalendarRange, ChevronLeft, ChevronRight, Clock, MapPin, Plus, UserCheck, UserX, Users } from 'lucide-react';
import { AsignarInstructorDialog, ClaseSinCobertura } from './AsignarInstructorDialog';

interface TurnoAgenda {
  id: string;
  staffId: string;
  staffNombre: string;
  fecha: string;
  inicio: number; // minutos desde medianoche (hora local de la organización)
  fin: number;
  estado: string;
}

type Cobertura = 'cubierta' | 'sin_turno' | 'sin_entrenador';

interface ClaseAgenda {
  id: string;
  nombreClase: string;
  fechaHora: string;
  disciplinaId: string | null;
  fecha: string;
  inicio: number;
  duracionMinutos: number;
  capacidadMaxima: number;
  ocupados: number;
  entrenadorId: string | null;
  entrenadorNombre: string | null;
  disciplina: string | null;
  sala?: string | null;
  recurrente: boolean;
  cobertura: Cobertura;
}

interface AgendaSemana {
  dias: string[];
  hoy: string;
  puede: { verClases: boolean; verTurnos: boolean; crearClases: boolean };
  turnos: TurnoAgenda[];
  clases: ClaseAgenda[];
}

const PX_POR_HORA = 56;
// Una franja por persona, con color propio (se repite si hay más de 8).
const COLORES_STAFF = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#8b5cf6', '#14b8a6', '#f97316'];
const ANCHO_FRANJA = 6;
const SEPARACION_FRANJA = 3;

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const sumarDias = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const etiquetaDia = (fecha: string) => {
  const d = new Date(`${fecha}T00:00:00Z`);
  return {
    semana: d.toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' }),
    numero: d.getUTCDate(),
  };
};
const etiquetaRango = (dias: string[]) => {
  if (dias.length === 0) return '';
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };
  return `${new Date(`${dias[0]}T00:00:00Z`).toLocaleDateString('es-ES', opts)} – ${new Date(`${dias[6]}T00:00:00Z`).toLocaleDateString('es-ES', { ...opts, year: 'numeric' })}`;
};

// Reparte en columnas las clases que se superponen en el mismo día, para que
// no se tapen entre sí.
function distribuirClases(clases: ClaseAgenda[]) {
  const orden = [...clases].sort((a, b) => a.inicio - b.inicio || b.duracionMinutos - a.duracionMinutos);
  const resultado: { clase: ClaseAgenda; columna: number; columnas: number }[] = [];
  let grupo: { clase: ClaseAgenda; columna: number }[] = [];
  let finGrupo = -1;
  const cerrarGrupo = () => {
    const columnas = Math.max(1, ...grupo.map((g) => g.columna + 1));
    grupo.forEach((g) => resultado.push({ ...g, columnas }));
    grupo = [];
  };
  for (const clase of orden) {
    if (clase.inicio >= finGrupo) {
      cerrarGrupo();
      finGrupo = -1;
    }
    const ocupadas = new Set(grupo.filter((g) => g.clase.inicio + g.clase.duracionMinutos > clase.inicio).map((g) => g.columna));
    let columna = 0;
    while (ocupadas.has(columna)) columna++;
    grupo.push({ clase, columna });
    finGrupo = Math.max(finGrupo, clase.inicio + clase.duracionMinutos);
  }
  cerrarGrupo();
  return resultado;
}

const ESTILO_COBERTURA: Record<Cobertura, string> = {
  cubierta: 'bg-indigo-50 border-indigo-300 text-indigo-950 dark:bg-indigo-500/20 dark:border-indigo-500/60 dark:text-indigo-50',
  sin_turno: 'bg-amber-50 border-amber-400 text-amber-950 dark:bg-amber-500/20 dark:border-amber-500/70 dark:text-amber-50',
  sin_entrenador: 'bg-rose-50 border-rose-400 border-dashed text-rose-950 dark:bg-rose-500/20 dark:border-rose-500/70 dark:text-rose-50',
};

export default function AgendaPage() {
  const router = useRouter();
  const { token } = useAuth();
  const { hasPermission } = usePermissions();
  const puedeAsignar = hasPermission('clases:actualizar');
  const [asignando, setAsignando] = useState<ClaseSinCobertura | null>(null);

  // Vista "Día" (plan 9): en celular la grilla de 7 días no entra; se abre así.
  const [vista, setVista] = useState<'semana' | 'dia'>('semana');
  const [diaElegido, setDiaElegido] = useState<string | null>(null);
  useEffect(() => {
    if (window.matchMedia('(max-width: 767px)').matches) setVista('dia');
  }, []);

  // ---------------- Sucursal: la activa de la barra superior (se elige ahí, no acá).
  const { sucursalId, sucursal, variasSucursales } = useSucursalActiva();

  // ---------------- Semana
  const [fechaRef, setFechaRef] = useState<string | null>(null); // null = semana actual
  const { data, isLoading, error } = useQuery({
    queryKey: ['agenda', sucursalId, fechaRef],
    queryFn: async () => apiGet<AgendaSemana>(`/agenda/semana?sucursalId=${sucursalId}${fechaRef ? `&fecha=${fechaRef}` : ''}`),
    enabled: !!token && !!sucursalId,
    refetchInterval: 60 * 1000,
    placeholderData: (previo) => previo,
  });

  // ---------------- Derivados
  const turnos = useMemo(() => data?.turnos ?? [], [data]);
  const clases = useMemo(() => data?.clases ?? [], [data]);

  const colorStaff = useMemo(() => {
    const nombres = [...new Map(turnos.map((t) => [t.staffId, t.staffNombre])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    return new Map(nombres.map(([id], i) => [id, COLORES_STAFF[i % COLORES_STAFF.length]]));
  }, [turnos]);

  const [horaMin, horaMax] = useMemo(() => {
    let min = 6 * 60;
    let max = 22 * 60;
    for (const t of turnos) { min = Math.min(min, t.inicio); max = Math.max(max, t.fin); }
    for (const c of clases) { min = Math.min(min, c.inicio); max = Math.max(max, c.inicio + c.duracionMinutos); }
    return [Math.floor(min / 60), Math.min(24, Math.ceil(max / 60))];
  }, [turnos, clases]);
  const horas = Array.from({ length: horaMax - horaMin }, (_, i) => horaMin + i);
  const alto = (horaMax - horaMin) * PX_POR_HORA;
  const aPx = (min: number) => ((min - horaMin * 60) / 60) * PX_POR_HORA;

  const huecos = clases.filter((c) => c.cobertura !== 'cubierta');
  const horasPorPersona = useMemo(() => {
    const mapa = new Map<string, { nombre: string; minutos: number }>();
    for (const t of turnos) {
      if (t.estado === 'AUSENTE' || t.estado === 'CANCELADO') continue;
      const actual = mapa.get(t.staffId) ?? { nombre: t.staffNombre, minutos: 0 };
      actual.minutos += t.fin - t.inicio;
      mapa.set(t.staffId, actual);
    }
    return [...mapa.entries()].sort((a, b) => a[1].nombre.localeCompare(b[1].nombre));
  }, [turnos]);

  if (!token) return null;

  const puede = data?.puede;
  const diaActivo = data ? (diaElegido && data.dias.includes(diaElegido) ? diaElegido : data.dias.includes(data.hoy) ? data.hoy : data.dias[0]) : null;
  const irASemana = (desplazamiento: number) => {
    if (!data) return;
    setFechaRef(desplazamiento === 0 ? null : sumarDias(data.dias[0], desplazamiento * 7));
  };

  const abrirNuevaClase = (fecha: string, minutos: number) => {
    if (!puede?.crearClases || !sucursalId) return;
    router.push(`/dashboard/clases?nueva=${fecha}T${hhmm(minutos)}&sucursal=${sucursalId}`);
  };

  const clickEnDia = (fecha: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // clic sobre una clase o una franja
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const minutos = horaMin * 60 + Math.floor(((y / PX_POR_HORA) * 60) / 30) * 30; // redondeo a media hora
    abrirNuevaClase(fecha, minutos);
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarRange className="h-6 w-6 text-indigo-600 dark:text-indigo-400" /> Agenda
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Jornadas del equipo y clases de la semana en un solo lugar.{puede?.crearClases ? ' Haz clic en un hueco para programar una clase.' : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {variasSucursales && sucursal && (
            <span className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              <MapPin className="w-4 h-4 text-slate-400" /> {sucursal.nombre}
            </span>
          )}

          <div className="flex gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1 text-xs font-medium" role="group" aria-label="Vista">
            {(['dia', 'semana'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)} className={`rounded-md px-3 py-1.5 ${vista === v ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'}`}>
                {v === 'dia' ? 'Día' : 'Semana'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => irASemana(-1)} aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => { irASemana(0); setDiaElegido(null); }}>Hoy</Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => irASemana(1)} aria-label="Semana siguiente"><ChevronRight className="h-4 w-4" /></Button>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 px-2 whitespace-nowrap">{data ? etiquetaRango(data.dias) : ''}</span>
          </div>
        </div>
      </div>

      {!sucursalId ? (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-500/20 p-6 text-amber-800 dark:text-amber-200">
          No hay una sucursal seleccionada. Crea una sucursal o elige una organización específica en el menú superior.
        </div>
      ) : error ? (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-500/20 p-6 text-amber-800 dark:text-amber-200">
          {(error as Error).message}
        </div>
      ) : isLoading || !data ? (
        <div className="h-[600px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 animate-pulse" />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
          {vista === 'dia' && diaActivo ? (
            <VistaDia
              dias={data.dias}
              hoy={data.hoy}
              dia={diaActivo}
              onElegirDia={setDiaElegido}
              turnos={turnos.filter((t) => t.fecha === diaActivo)}
              clases={clases.filter((c) => c.fecha === diaActivo)}
              colorStaff={colorStaff}
              puedeCrear={!!puede?.crearClases}
              puedeAsignar={puedeAsignar}
              onAbrirClase={(id) => router.push(`/dashboard/clases?clase=${id}`)}
              onNuevaClase={(minutos) => abrirNuevaClase(diaActivo, minutos)}
              onAsignar={setAsignando}
            />
          ) : (
          /* ---------------- Grilla semanal ---------------- */
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[860px]">
                <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                  <div />
                  {data.dias.map((fecha) => {
                    const { semana, numero } = etiquetaDia(fecha);
                    const esHoy = fecha === data.hoy;
                    return (
                      <div key={fecha} className={`py-2 text-center border-l border-slate-200 dark:border-slate-800 ${esHoy ? 'bg-indigo-50 dark:bg-indigo-500/15' : ''}`}>
                        <p className={`text-xs font-semibold uppercase ${esHoy ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>{semana}</p>
                        <p className={`text-lg font-bold ${esHoy ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-100'}`}>{numero}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-[56px_repeat(7,1fr)] max-h-[70vh] overflow-y-auto">
                  {/* Columna de horas */}
                  <div className="relative" style={{ height: alto }}>
                    {horas.map((h) => (
                      <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] font-medium text-slate-400 dark:text-slate-500" style={{ top: aPx(h * 60) }}>
                        {h > horaMin ? `${String(h).padStart(2, '0')}:00` : ''}
                      </span>
                    ))}
                  </div>

                  {data.dias.map((fecha) => {
                    const turnosDia = turnos.filter((t) => t.fecha === fecha);
                    const carriles = [...new Set(turnosDia.map((t) => t.staffId))];
                    const margenIzq = carriles.length * (ANCHO_FRANJA + SEPARACION_FRANJA) + 4;
                    const clasesDia = distribuirClases(clases.filter((c) => c.fecha === fecha));
                    return (
                      <div
                        key={fecha}
                        className={`relative border-l border-slate-200 dark:border-slate-800 ${puede?.crearClases ? 'cursor-copy' : ''} ${fecha === data.hoy ? 'bg-indigo-50/30 dark:bg-indigo-500/5' : ''}`}
                        style={{
                          height: alto,
                          backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${PX_POR_HORA - 1}px, rgb(148 163 184 / 0.25) ${PX_POR_HORA - 1}px, rgb(148 163 184 / 0.25) ${PX_POR_HORA}px)`,
                        }}
                        onClick={(e) => clickEnDia(fecha, e)}
                      >
                        {/* Turnos: una franja vertical por persona */}
                        {turnosDia.map((t) => {
                          const inactivo = t.estado === 'AUSENTE' || t.estado === 'CANCELADO';
                          const color = colorStaff.get(t.staffId) ?? COLORES_STAFF[0];
                          return (
                            <div
                              key={t.id}
                              title={`${t.staffNombre} · ${hhmm(t.inicio)}–${hhmm(t.fin)}${inactivo ? ` (${t.estado.toLowerCase()})` : ''}`}
                              className="absolute rounded-full"
                              style={{
                                top: aPx(t.inicio),
                                height: Math.max(4, aPx(t.fin) - aPx(t.inicio)),
                                left: 3 + carriles.indexOf(t.staffId) * (ANCHO_FRANJA + SEPARACION_FRANJA),
                                width: ANCHO_FRANJA,
                                background: inactivo ? `repeating-linear-gradient(45deg, ${color}55 0 3px, transparent 3px 6px)` : color,
                                opacity: inactivo ? 0.8 : 0.85,
                              }}
                            />
                          );
                        })}

                        {/* Clases */}
                        {clasesDia.map(({ clase: c, columna, columnas }) => {
                          const top = aPx(c.inicio);
                          const altura = Math.max(22, aPx(c.inicio + c.duracionMinutos) - top - 2);
                          const lleno = c.ocupados >= c.capacidadMaxima;
                          return (
                            <button
                              type="button"
                              key={c.id}
                              onClick={() => router.push(`/dashboard/clases?clase=${c.id}`)}
                              title={`${c.nombreClase} · ${hhmm(c.inicio)} · ${c.entrenadorNombre ?? 'sin instructor'}${c.sala ? ` · ${c.sala}` : ''}`}
                              className={`absolute rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm overflow-hidden hover:z-20 hover:shadow-md transition-shadow ${ESTILO_COBERTURA[c.cobertura]}`}
                              style={{
                                top,
                                height: altura,
                                left: `calc(${margenIzq}px + (100% - ${margenIzq + 4}px) * ${columna / columnas})`,
                                width: `calc((100% - ${margenIzq + 4}px) / ${columnas} - 2px)`,
                              }}
                            >
                              <p className="font-semibold truncate">{hhmm(c.inicio)} {c.nombreClase}</p>
                              {altura > 34 && (
                                <p className="truncate opacity-80 flex items-center gap-1">
                                  {c.cobertura === 'sin_entrenador' ? <><UserX className="w-3 h-3 shrink-0" /> Sin instructor</> : c.entrenadorNombre}
                                  {c.cobertura === 'sin_turno' && <AlertTriangle className="w-3 h-3 shrink-0" />}
                                </p>
                              )}
                              {altura > 50 && (
                                <p className={`flex items-center gap-1 opacity-80 ${lleno ? 'font-semibold' : ''}`}>
                                  <Users className="w-3 h-3" /> {c.ocupados}/{c.capacidadMaxima}
                                </p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          )}

          {/* ---------------- Panel lateral ---------------- */}
          <aside className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2 text-xs">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cómo leer la agenda</p>
              {puede?.verTurnos && <p className="text-slate-600 dark:text-slate-400">Las franjas de color a la izquierda de cada día son las jornadas del equipo (rayadas = ausente o cancelada).</p>}
              <p className="flex items-center gap-2 text-slate-600 dark:text-slate-400"><span className={`inline-block h-3 w-5 rounded border ${ESTILO_COBERTURA.cubierta}`} /> Instructor que trabaja a esa hora</p>
              <p className="flex items-center gap-2 text-slate-600 dark:text-slate-400"><span className={`inline-block h-3 w-5 rounded border ${ESTILO_COBERTURA.sin_turno}`} /> Instructor que no trabaja a esa hora</p>
              <p className="flex items-center gap-2 text-slate-600 dark:text-slate-400"><span className={`inline-block h-3 w-5 rounded border ${ESTILO_COBERTURA.sin_entrenador}`} /> Clase sin instructor</p>
            </div>

            {puede?.verClases && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Huecos de cobertura ({huecos.length})
                </p>
                {huecos.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Todas las clases de la semana tienen un instructor que trabaja a esa hora.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5 max-h-72 overflow-y-auto">
                    {huecos.map((c) => (
                      <li key={c.id} className="rounded-md hover:bg-slate-50 dark:hover:bg-slate-800">
                        <button type="button" onClick={() => router.push(`/dashboard/clases?clase=${c.id}`)} className="w-full text-left px-2 pt-1.5">
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{etiquetaDia(c.fecha).semana} {etiquetaDia(c.fecha).numero} · {hhmm(c.inicio)} · {c.nombreClase}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {c.cobertura === 'sin_entrenador' ? 'Sin instructor asignado' : `${c.entrenadorNombre} no trabaja a esa hora`}
                          </p>
                        </button>
                        {puedeAsignar && (
                          <button type="button" onClick={() => setAsignando(c)} className="flex items-center gap-1 px-2 pb-1.5 pt-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                            <UserCheck className="h-3 w-3" /> Asignar instructor
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {puede?.verTurnos && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Horas de trabajo esta semana</p>
                {horasPorPersona.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Nadie tiene jornadas esta semana en esta sucursal.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {horasPorPersona.map(([id, p]) => (
                      <li key={id} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <span className="inline-block h-3 w-1.5 rounded-full" style={{ background: colorStaff.get(id) }} /> {p.nombre}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{(p.minutos / 60).toLocaleString('es-ES', { maximumFractionDigits: 1 })} h</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      {sucursalId && <AsignarInstructorDialog clase={asignando} sucursalId={sucursalId} onClose={() => setAsignando(null)} />}
    </div>
  );
}

// Lista del día con jornadas y clases en orden de hora (plan 9: en celular la
// grilla semanal no entra).
function VistaDia({
  dias, hoy, dia, onElegirDia, turnos, clases, colorStaff, puedeCrear, puedeAsignar, onAbrirClase, onNuevaClase, onAsignar,
}: {
  dias: string[];
  hoy: string;
  dia: string;
  onElegirDia: (fecha: string) => void;
  turnos: TurnoAgenda[];
  clases: ClaseAgenda[];
  colorStaff: Map<string, string>;
  puedeCrear: boolean;
  puedeAsignar: boolean;
  onAbrirClase: (id: string) => void;
  onNuevaClase: (minutos: number) => void;
  onAsignar: (c: ClaseAgenda) => void;
}) {
  const items = [
    ...turnos.map((t) => ({ tipo: 'turno' as const, inicio: t.inicio, turno: t })),
    ...clases.map((c) => ({ tipo: 'clase' as const, inicio: c.inicio, clase: c })),
  ].sort((a, b) => a.inicio - b.inicio || (a.tipo === 'turno' ? -1 : 1));

  // Para "Programar una clase": la próxima media hora si es hoy; si no, las 8:00.
  const ahora = new Date();
  const proxima = Math.ceil((ahora.getHours() * 60 + ahora.getMinutes()) / 30) * 30;
  const horaSugerida = dia === hoy && proxima < 22 * 60 ? proxima : 8 * 60;

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Día">
        {dias.map((fecha) => {
          const { semana, numero } = etiquetaDia(fecha);
          const activo = fecha === dia;
          return (
            <button
              key={fecha}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => onElegirDia(fecha)}
              className={`flex min-w-[3.25rem] flex-col items-center rounded-lg border px-2 py-1.5 ${
                activo
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200'
                  : 'border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-300'
              }`}
            >
              <span className="text-[11px] font-semibold uppercase">{semana}</span>
              <span className={`text-base font-bold ${fecha === hoy && !activo ? 'text-indigo-600 dark:text-indigo-400' : ''}`}>{numero}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
        {items.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">No hay jornadas ni clases este día.</p>
        ) : (
          items.map((item) =>
            item.tipo === 'turno' ? (
              <div key={`t-${item.turno.id}`} className="flex items-center gap-3 px-4 py-2.5">
                <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: colorStaff.get(item.turno.staffId) }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{item.turno.staffNombre}</p>
                  <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Clock className="h-3 w-3" /> Jornada {hhmm(item.turno.inicio)}–{hhmm(item.turno.fin)}
                  </p>
                </div>
                {(item.turno.estado === 'AUSENTE' || item.turno.estado === 'CANCELADO') && (
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    {item.turno.estado === 'AUSENTE' ? 'Ausente' : 'Cancelada'}
                  </span>
                )}
              </div>
            ) : (
              <div key={`c-${item.clase.id}`} className="px-4 py-2.5">
                <button type="button" onClick={() => onAbrirClase(item.clase.id)} className={`w-full rounded-lg border px-3 py-2 text-left ${ESTILO_COBERTURA[item.clase.cobertura]}`}>
                  <p className="text-sm font-semibold">{hhmm(item.clase.inicio)}–{hhmm(item.clase.inicio + item.clase.duracionMinutos)} · {item.clase.nombreClase}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs opacity-80">
                    <span className="flex items-center gap-1">
                      {item.clase.cobertura === 'sin_entrenador' ? <><UserX className="h-3 w-3" /> Sin instructor</> : item.clase.entrenadorNombre}
                      {item.clase.cobertura === 'sin_turno' && <> · no trabaja a esa hora</>}
                    </span>
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {item.clase.ocupados}/{item.clase.capacidadMaxima}</span>
                    {item.clase.sala && <span>{item.clase.sala}</span>}
                  </p>
                </button>
                {puedeAsignar && item.clase.cobertura !== 'cubierta' && (
                  <button type="button" onClick={() => onAsignar(item.clase)} className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                    <UserCheck className="h-3.5 w-3.5" /> Asignar instructor
                  </button>
                )}
              </div>
            ),
          )
        )}
      </div>

      {puedeCrear && (
        <Button variant="outline" className="w-full" onClick={() => onNuevaClase(horaSugerida)}>
          <Plus className="mr-2 h-4 w-4" /> Programar una clase este día
        </Button>
      )}
    </div>
  );
}
