"use client";

import { Ayuda } from '@/components/ui/ayuda';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { useSucursalActiva } from '@/hooks/use-sucursal-activa';
import { apiGet, apiPost, unwrapList } from '@/lib/api-client';
import { useSoftDelete } from '@/hooks/use-soft-delete';
import { Button } from '@/components/ui/button';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { Protect } from '@/components/ui/protect';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Plus, Search, Users, ArchiveRestore, Repeat } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PapeleraToggle } from '@/components/ui/papelera-toggle';
import { WeeklyCalendar } from '@/components/ui/weekly-calendar';
import { NuevaClaseWizard, InicioAsistente } from './NuevaClaseWizard';
import { SesionDialog } from './SesionDialog';
import { Clase, ClasePlantilla, DIAS_CORTOS, DIAS_SEMANA, SerieClase, agruparSeries, horaDe, OCUPA_CUPO } from './compartido';

/**
 * Clases (plan de simplificación, 8.1): una sola pantalla. El calendario es la
 * vista principal; cada sesión se abre con "Solo esta sesión / Toda la clase".
 * Al costado, "Mis clases": las clases que se repiten cada semana.
 */
export default function ClasesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const { activeTenantId } = useTenantStore();
  const { sucursalId: sucursalActiva, variasSucursales } = useSucursalActiva();

  const [viewMode, setViewMode] = useState<'calendar' | 'table'>('calendar');
  const [currentWeekDate, setCurrentWeekDate] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [soloSucursalActiva, setSoloSucursalActiva] = useState(true);
  const [confirmConfig, setConfirmConfig] = useState({ title: '', description: '', onConfirm: () => {} });
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Asistente y sesión abierta
  const [asistenteAbierto, setAsistenteAbierto] = useState(false);
  const [serieEnEdicion, setSerieEnEdicion] = useState<SerieClase | null>(null);
  const [inicioAsistente, setInicioAsistente] = useState<InicioAsistente | null>(null);
  const [sesionId, setSesionId] = useState<string | null>(null);
  const [papeleraSeries, setPapeleraSeries] = useState(false);

  const { data: clases, isLoading } = useQuery({
    queryKey: ['clases', activeTenantId, showDeleted],
    queryFn: async () => unwrapList<Clase>(await apiGet(showDeleted ? '/clases?deleted=true' : '/clases?limit=100')),
    enabled: !!token,
    // El calendario lo suele mirar más de una persona a la vez (recepción,
    // coordinador): se refresca solo.
    refetchOnWindowFocus: true,
    refetchInterval: 30 * 1000,
  });

  const { data: clasesPlantilla } = useQuery({
    queryKey: ['clases-plantilla', activeTenantId, papeleraSeries],
    queryFn: async () => unwrapList<ClasePlantilla>(await apiGet(papeleraSeries ? '/clases-plantilla?deleted=true&limit=100' : '/clases-plantilla?limit=100')),
    enabled: !!token,
  });

  const { restoreItem, isRestoring } = useSoftDelete({
    queryKey: ['clases', activeTenantId, showDeleted],
    endpoint: 'clases',
    modelName: 'claseProgramada',
    itemName: 'La sesión',
  });
  const { restoreItem: restorePlantilla, isRestoring: isRestoringPlantilla } = useSoftDelete({
    queryKey: ['clases-plantilla', activeTenantId, papeleraSeries],
    endpoint: 'clases-plantilla',
    modelName: 'clasePlantilla',
    itemName: 'La clase',
  });

  const eliminarSerieMutation = useMutation({
    mutationFn: async (serie: SerieClase) => apiPost<Record<string, number>>('/clases-plantilla/serie/eliminar', { ids: serie.ids }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['clases-plantilla'] });
      queryClient.invalidateQueries({ queryKey: ['clases'] });
      setSesionId(null);
      const conservadas = res?.clasesConservadas ? ` Se conservaron ${res.clasesConservadas} sesiones con reservas.` : '';
      toast({ title: 'La clase ya no se programa', description: `Se quitaron ${res?.clasesEliminadas ?? 0} sesiones futuras.${conservadas}`, variant: 'success' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const plantillas = useMemo(() => unwrapList<ClasePlantilla>(clasesPlantilla), [clasesPlantilla]);
  const series = useMemo(() => (papeleraSeries ? [] : agruparSeries(plantillas)), [plantillas, papeleraSeries]);
  const lista = useMemo(() => unwrapList<Clase>(clases), [clases]);

  // Ocupación promedio de cada clase (sesiones cargadas, pasadas o futuras).
  const ocupacion = useMemo(() => {
    const porPlantilla = new Map<string, { usados: number; cupos: number }>();
    for (const c of lista) {
      if (!c.clasePlantillaId || c.estado !== 'ACTIVO') continue;
      const acc = porPlantilla.get(c.clasePlantillaId) ?? { usados: 0, cupos: 0 };
      acc.usados += (c.reservas ?? []).filter((r) => OCUPA_CUPO(r.estado)).length;
      acc.cupos += c.capacidadMaxima;
      porPlantilla.set(c.clasePlantillaId, acc);
    }
    return (serie: SerieClase) => {
      const total = serie.ids.reduce((a, id) => {
        const o = porPlantilla.get(id);
        return o ? { usados: a.usados + o.usados, cupos: a.cupos + o.cupos } : a;
      }, { usados: 0, cupos: 0 });
      return total.cupos ? Math.round((total.usados / total.cupos) * 100) : null;
    };
  }, [lista]);

  const serieDeSesion = (claseId: string | null) => {
    const plantillaId = lista.find((c) => c.id === claseId)?.clasePlantillaId;
    return plantillaId ? series.find((s) => s.ids.includes(plantillaId)) ?? null : null;
  };

  const abrirAsistente = (inicio?: InicioAsistente | null, serie?: SerieClase | null) => {
    setInicioAsistente(inicio ?? null);
    setSerieEnEdicion(serie ?? null);
    setAsistenteAbierto(true);
  };

  const pedirEliminarSerie = (serie: SerieClase) => {
    setConfirmConfig({
      title: '¿Dejar de programar esta clase?',
      description: `Se dejará de programar "${serie.base.nombreClase}" y se quitarán sus sesiones futuras sin reservas (las que tienen reservas se conservan).`,
      onConfirm: () => eliminarSerieMutation.mutate(serie),
    });
    setConfirmOpen(true);
  };

  // Enlaces desde la Agenda: ?nueva=YYYY-MM-DDTHH:MM&sucursal=<id> abre el
  // asistente con esa sucursal fija y ese día y hora marcados; ?clase=<id> abre
  // la sesión. Se lee window.location (no useSearchParams) para no exigir un
  // Suspense, y se limpia la URL para que un F5 no vuelva a abrirlo.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nueva = params.get('nueva');
    const claseId = params.get('clase');
    if (!nueva && !claseId) return;
    if (nueva) abrirAsistente({ fecha: new Date(nueva), sucursalId: params.get('sucursal') ?? undefined, sucursalFija: true });
    if (claseId) setSesionId(claseId);
    window.history.replaceState(null, '', window.location.pathname);
    // Solo al montar: es la lectura de los parámetros con los que se llegó.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!token) return null;

  const filtradas = lista.filter((c) => {
    if (searchTerm && !c.nombreClase?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    // Por defecto se ve la sucursal activa (plan 5.1); quien tiene acceso a todas puede ver todas.
    if (soloSucursalActiva && sucursalActiva && !user?.sucursalId && c.sucursalId && c.sucursalId !== sucursalActiva) return false;
    return true;
  });

  return (
    <Protect permission="clases:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Clases <Ayuda tema="clase" /></h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Toca una sesión para ver sus reservas o cambiar solo esa fecha; toca un hueco para crear una clase.</p>
          </div>
          <Protect permission="clases:crear" fallbackType="hide">
            <TenantRequiredButton onClick={() => abrirAsistente()} icon={<Plus className="mr-2 h-4 w-4" />} label="Nueva clase" />
          </Protect>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
          {/* ---------------- Calendario / lista de sesiones ---------------- */}
          <div className="space-y-4 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              {viewMode === 'calendar' && (
                <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-1">
                  <Button variant="ghost" size="sm" className="h-8 px-2" aria-label="Semana anterior" onClick={() => setCurrentWeekDate(new Date(currentWeekDate.getTime() - 7 * 86400000))}>&lt;</Button>
                  <Button variant="ghost" size="sm" className="h-8 px-3 text-xs font-semibold" onClick={() => setCurrentWeekDate(new Date())}>Hoy</Button>
                  <Button variant="ghost" size="sm" className="h-8 px-2" aria-label="Semana siguiente" onClick={() => setCurrentWeekDate(new Date(currentWeekDate.getTime() + 7 * 86400000))}>&gt;</Button>
                </div>
              )}
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                {(['calendar', 'table'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setViewMode(v)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === v ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
                  >
                    {v === 'calendar' ? 'Calendario' : 'Lista'}
                  </button>
                ))}
              </div>
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar clase..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900"
                />
              </div>
              {variasSucursales && !user?.sucursalId && (
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={soloSucursalActiva} onChange={(e) => setSoloSucursalActiva(e.target.checked)} />
                  Solo la sucursal activa
                </label>
              )}
              {viewMode === 'table' && <PapeleraToggle showDeleted={showDeleted} setShowDeleted={setShowDeleted} />}
            </div>

            {isLoading ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 flex justify-center">
                <div className="animate-pulse h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-full" />
              </div>
            ) : viewMode === 'calendar' ? (
              <WeeklyCalendar
                classes={filtradas}
                currentDate={currentWeekDate}
                onDateClick={(fecha) => abrirAsistente({ fecha })}
                onClassClick={(c) => setSesionId(c.id)}
                onReservaClick={(id, e) => { e.stopPropagation(); setSesionId(id); }}
              />
            ) : filtradas.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
                <CalendarDays className="w-6 h-6 mx-auto mb-3 text-slate-400" />
                <p className="text-base font-semibold text-slate-900 dark:text-white">{searchTerm ? 'Ninguna clase coincide con la búsqueda' : 'No hay sesiones programadas'}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clase</TableHead>
                    <TableHead>Instructor</TableHead>
                    {variasSucursales && <TableHead>Sucursal</TableHead>}
                    <TableHead>Fecha y hora</TableHead>
                    <TableHead>Cupos</TableHead>
                    <TableHead>Estado</TableHead>
                    {showDeleted && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.map((c) => (
                    <TableRow key={c.id} className={showDeleted ? 'bg-rose-50/40 dark:bg-rose-500/20 opacity-80' : 'cursor-pointer'} onClick={() => !showDeleted && setSesionId(c.id)}>
                      <TableCell>
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">{c.nombreClase}</p>
                        {c.disciplina?.nombre && <p className="text-xs text-slate-500">{c.disciplina.nombre}</p>}
                      </TableCell>
                      <TableCell><span className="text-xs text-slate-600 dark:text-slate-400">{c.entrenador?.usuario?.nombreCompleto || 'Sin instructor'}</span></TableCell>
                      {variasSucursales && <TableCell><span className="text-xs text-slate-600 dark:text-slate-400">{c.sucursal?.nombre}</span></TableCell>}
                      <TableCell>
                        <span className="text-xs text-slate-600 dark:text-slate-400">
                          {new Date(c.fechaHora).toLocaleString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${(c.reservas?.length || 0) >= c.capacidadMaxima ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300' : 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'}`}>
                          <Users className="w-3 h-3" /> {c.reservas?.length || 0}/{c.capacidadMaxima}
                        </span>
                      </TableCell>
                      <TableCell>{c.estado === 'ACTIVO' ? <Badge variant="success">Activa</Badge> : <Badge variant="default">Cancelada</Badge>}</TableCell>
                      {showDeleted && (
                        <TableCell className="text-right">
                          <Protect permission="sistema:restaurar">
                            <Button variant="ghost" size="sm" onClick={() => restoreItem(c.id)} disabled={isRestoring} className="text-indigo-600 h-8 px-3">
                              <ArchiveRestore className="h-4 w-4 mr-2" /> Restaurar
                            </Button>
                          </Protect>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* ---------------- Mis clases (las que se repiten) ---------------- */}
          <aside className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Repeat className="h-4 w-4" /> Mis clases</h3>
              <PapeleraToggle showDeleted={papeleraSeries} setShowDeleted={setPapeleraSeries} />
            </div>
            {papeleraSeries ? (
              plantillas.length === 0 ? (
                <p className="text-sm text-slate-500">La papelera está vacía.</p>
              ) : (
                plantillas.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-500/10 p-3 text-sm">
                    <span>{p.nombreClase} · {DIAS_SEMANA[p.diaSemana]} {horaDe(p.horaInicio)}</span>
                    <Protect permission="sistema:restaurar">
                      <Button variant="ghost" size="sm" onClick={() => restorePlantilla(p.id)} disabled={isRestoringPlantilla}><ArchiveRestore className="h-4 w-4" /></Button>
                    </Protect>
                  </div>
                ))
              )
            ) : series.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Todavía no hay clases que se repitan. Crea una con &quot;Nueva clase&quot;.</p>
            ) : (
              series.map((serie) => {
                const p = serie.base;
                const porcentaje = ocupacion(serie);
                return (
                  <button
                    key={serie.clave}
                    type="button"
                    onClick={() => abrirAsistente(null, serie)}
                    className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-indigo-300 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-slate-900 dark:text-white">{p.nombreClase}</span>
                      {!p.activa && <Badge variant="outline">Pausada</Badge>}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                      {serie.dias.map((d) => DIAS_CORTOS[d]).join(', ')} · {horaDe(p.horaInicio)} · {p.duracionMinutos} min
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {p.entrenador?.usuario?.nombreCompleto || 'Sin instructor'}
                      {variasSucursales && p.sucursal ? ` · ${p.sucursal.nombre}` : ''}
                      {porcentaje !== null ? ` · ${porcentaje}% de ocupación` : ''}
                    </p>
                  </button>
                );
              })
            )}
          </aside>
        </div>
      </div>

      <NuevaClaseWizard
        open={asistenteAbierto}
        onOpenChange={setAsistenteAbierto}
        series={series}
        editarSerie={serieEnEdicion}
        inicio={inicioAsistente}
      />

      <SesionDialog
        claseId={sesionId}
        onClose={() => setSesionId(null)}
        serie={serieDeSesion(sesionId)}
        onEditarSerie={(serie) => { setSesionId(null); abrirAsistente(null, serie); }}
        onEliminarSerie={pedirEliminarSerie}
      />

      <GlobalConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        onConfirm={confirmConfig.onConfirm}
        isDestructive={true}
      />
    </Protect>
  );
}
