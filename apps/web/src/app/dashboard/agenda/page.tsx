"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, unwrapList } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CalendarRange, ChevronLeft, ChevronRight, MapPin, UserX, Users } from 'lucide-react';

interface Sucursal { id: string; nombre: string; }

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
  fecha: string;
  inicio: number;
  duracionMinutos: number;
  capacidadMaxima: number;
  ocupados: number;
  entrenadorId: string | null;
  entrenadorNombre: string | null;
  disciplina: string | null;
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
const STORAGE_SUCURSAL = 'agenda.sucursalId';
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
  const { token, user } = useAuth();
  const { activeTenantId } = useTenantStore();
  const sucursalFija = user?.sucursalId || null;

  // ---------------- Sucursal (misma lógica que el control de acceso)
  const { data: sucursalesData } = useQuery({
    queryKey: ['sucursales', activeTenantId],
    queryFn: async () => unwrapList<Sucursal>(await apiGet('/sucursales')),
    enabled: !!token,
  });
  const sucursales = sucursalesData || [];
  const [sucursalElegida, setSucursalElegida] = useState<string | null>(null);
  useEffect(() => {
    if (sucursalElegida || sucursales.length === 0) return;
    let guardada: string | null = null;
    try { guardada = localStorage.getItem(STORAGE_SUCURSAL); } catch { /* sin almacenamiento */ }
    setSucursalElegida(sucursales.some((s) => s.id === guardada) ? guardada : sucursales[0].id);
  }, [sucursales, sucursalElegida]);
  const sucursalId = sucursalFija || sucursalElegida;
  const cambiarSucursal = (id: string) => {
    setSucursalElegida(id);
    try { localStorage.setItem(STORAGE_SUCURSAL, id); } catch { /* sin almacenamiento */ }
  };

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
            Turnos del equipo y clases de la semana en un solo lugar.{puede?.crearClases ? ' Haz clic en un hueco para programar una clase.' : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
            <MapPin className="w-4 h-4 text-slate-400" />
            {sucursalFija ? (
              <span className="font-semibold text-slate-700 dark:text-slate-300">{user?.sucursalNombre || 'Mi sucursal'}</span>
            ) : (
              <select value={sucursalId || ''} onChange={(e) => cambiarSucursal(e.target.value)} className="bg-transparent font-semibold text-slate-700 dark:text-slate-300 outline-none cursor-pointer">
                {sucursales.length === 0 && <option value="">Sin sucursales</option>}
                {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            )}
          </label>

          <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => irASemana(-1)} aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => irASemana(0)}>Hoy</Button>
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
          {/* ---------------- Grilla semanal ---------------- */}
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
                              title={`${c.nombreClase} · ${hhmm(c.inicio)} · ${c.entrenadorNombre ?? 'sin entrenador'}`}
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
                                  {c.cobertura === 'sin_entrenador' ? <><UserX className="w-3 h-3 shrink-0" /> Sin entrenador</> : c.entrenadorNombre}
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

          {/* ---------------- Panel lateral ---------------- */}
          <aside className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2 text-xs">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cómo leer la agenda</p>
              {puede?.verTurnos && <p className="text-slate-600 dark:text-slate-400">Las franjas de color a la izquierda de cada día son los turnos del equipo (rayadas = ausente o cancelado).</p>}
              <p className="flex items-center gap-2 text-slate-600 dark:text-slate-400"><span className={`inline-block h-3 w-5 rounded border ${ESTILO_COBERTURA.cubierta}`} /> Entrenador con turno</p>
              <p className="flex items-center gap-2 text-slate-600 dark:text-slate-400"><span className={`inline-block h-3 w-5 rounded border ${ESTILO_COBERTURA.sin_turno}`} /> Entrenador sin turno a esa hora</p>
              <p className="flex items-center gap-2 text-slate-600 dark:text-slate-400"><span className={`inline-block h-3 w-5 rounded border ${ESTILO_COBERTURA.sin_entrenador}`} /> Clase sin entrenador</p>
            </div>

            {puede?.verClases && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Huecos de cobertura ({huecos.length})
                </p>
                {huecos.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Todas las clases de la semana tienen entrenador con turno.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5 max-h-72 overflow-y-auto">
                    {huecos.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => router.push(`/dashboard/clases?clase=${c.id}`)} className="w-full text-left rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{etiquetaDia(c.fecha).semana} {etiquetaDia(c.fecha).numero} · {hhmm(c.inicio)} · {c.nombreClase}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {c.cobertura === 'sin_entrenador' ? 'Sin entrenador asignado' : `${c.entrenadorNombre} no tiene turno a esa hora`}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {puede?.verTurnos && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Horas de turno esta semana</p>
                {horasPorPersona.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Nadie tiene turnos esta semana en esta sucursal.</p>
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
    </div>
  );
}
