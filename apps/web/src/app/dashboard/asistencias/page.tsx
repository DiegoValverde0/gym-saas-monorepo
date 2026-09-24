"use client";

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, apiPatch, unwrapList } from '@/lib/api-client';
import { Protect } from '@/components/ui/protect';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, UserCheck, UserX, Clock, Ban, CheckCircle2, Play, Info, CalendarCheck, UserPlus, History, Briefcase, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';

interface Cliente {
  id: string;
  nombre: string;
  numeroDocumento?: string | null;
}

interface Sucursal {
  id: string;
  nombre: string;
}

interface ClaseReservada {
  reservaId: string;
  nombreClase: string;
  fechaHora: string;
}

interface Validacion {
  allowed: boolean;
  reason?: string;
  tipoPlan?: string;
  sesionesRestantes?: number;
  clasesReservadasHoy?: ClaseReservada[];
}

interface RegistroAsistencia {
  id: string;
  fechaHoraIngreso: string;
  fechaHoraSalida?: string | null;
  nombreVisitante?: string | null;
  tipoAsistencia: string;
  motivoAnulacion?: string | null;
  cliente?: Cliente | null;
  membresia?: { plan?: { nombre: string } } | null;
  registradoPor?: { nombreCompleto: string } | null;
}

interface MiTurno {
  id: string;
  horaEntrada: string;
  horaSalida: string;
  horaIngresoReal?: string | null;
  horaSalidaReal?: string | null;
  sucursal?: { nombre: string } | null;
}

const TIPO_ASISTENCIA_LABEL: Record<string, string> = {
  MIEMBRO: 'Miembro',
  INVITADO: 'Invitado',
  VISITA_DIA: 'Visita de día',
  PRUEBA_GRATIS: 'Prueba gratis',
};

const STORAGE_SUCURSAL = 'asistencias.sucursalId';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
// Las horas de turno vienen como @db.Time (1970-01-01THH:MM:00Z): se muestran tal cual, sin convertir de zona.
const horaReloj = (iso: string) => new Date(iso).toISOString().substring(11, 16);

export default function AsistenciasPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { activeTenantId } = useTenantStore();
  const { token, user } = useAuth();
  const sucursalFija = user?.sucursalId || null;

  // ---------------------------------------------------------------------
  // Sucursal de trabajo. Antes se usaba el id de la ORGANIZACIÓN como si
  // fuera una sucursal, así que la lista de "adentro" salía siempre vacía.
  // ---------------------------------------------------------------------
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
    handleResetSearch();
  };

  // ---------------------------------------------------------------------
  // Búsqueda de clientes en el servidor (antes solo filtraba los primeros 50)
  // ---------------------------------------------------------------------
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm.trim(), 300);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [motivoForzado, setMotivoForzado] = useState('');

  const { data: resultados, isFetching: buscando } = useQuery({
    queryKey: ['clientes', activeTenantId, 'busqueda', debouncedSearch],
    queryFn: async () => unwrapList<Cliente>(await apiGet(`/clientes?search=${encodeURIComponent(debouncedSearch)}&limit=10`)),
    enabled: !!token && debouncedSearch.length >= 2,
  });

  // ---------------------------------------------------------------------
  // Registros de hoy
  // ---------------------------------------------------------------------
  const { data: activas, isLoading: loadingActivas } = useQuery({
    queryKey: ['asistencias_activas', sucursalId],
    queryFn: async () => unwrapList<RegistroAsistencia>(await apiGet(`/asistencias/activas/${sucursalId}`)),
    enabled: !!token && !!sucursalId,
    refetchInterval: 30 * 1000,
  });

  const { data: historial, isLoading: loadingHistorial } = useQuery({
    queryKey: ['asistencias_historial', sucursalId],
    queryFn: async () => unwrapList<RegistroAsistencia>(await apiGet(`/asistencias/historial/${sucursalId}`)),
    enabled: !!token && !!sucursalId,
  });

  const invalidarRegistros = () => {
    queryClient.invalidateQueries({ queryKey: ['asistencias_activas'] });
    queryClient.invalidateQueries({ queryKey: ['asistencias_historial'] });
  };

  // ---------------------------------------------------------------------
  // Mi turno (para el propio staff que atiende recepción)
  // ---------------------------------------------------------------------
  const { data: miTurno } = useQuery({
    queryKey: ['mi-turno-hoy', user?.sub],
    queryFn: async () => apiGet<MiTurno>('/turnos/mi-turno/hoy'),
    enabled: !!token && !user?.is_superadmin,
    retry: false, // 404 = no es staff o no tiene turno hoy: simplemente no se muestra la tarjeta
  });

  const marcarTurnoMutation = useMutation({
    mutationFn: async (accion: 'ingreso' | 'salida') => apiPost(`/turnos/mi-turno/marcar-${accion}`),
    onSuccess: (_, accion) => {
      toast({ title: accion === 'ingreso' ? 'Entrada de turno registrada' : 'Salida de turno registrada', variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['mi-turno-hoy'] });
    },
    onError: (err: Error) => toast({ title: 'No se pudo marcar', description: err.message, variant: 'destructive' }),
  });

  // ---------------------------------------------------------------------
  // Validación + ingreso de miembros
  // ---------------------------------------------------------------------
  const validateMutation = useMutation({
    mutationFn: async (clienteId: string) => apiPost<Validacion>('/asistencias/validate', { clienteId, sucursalId }),
    onError: (err: Error) => toast({ title: 'No se pudo validar el acceso', description: err.message, variant: 'destructive' }),
  });

  const avisarIngreso = (res: { clasesMarcadas?: string[] }) => {
    const clases = res?.clasesMarcadas ?? [];
    toast({
      title: 'Ingreso registrado',
      description: clases.length > 0 ? `Asistencia marcada en: ${clases.join(', ')}.` : undefined,
      variant: 'success',
    });
  };

  const checkinMutation = useMutation({
    mutationFn: async ({ forzar, motivo }: { forzar: boolean; motivo?: string }) => {
      if (!selectedCliente) throw new Error('Debe seleccionar un cliente');
      return apiPost<{ clasesMarcadas?: string[] }>('/asistencias/checkin', {
        clienteId: selectedCliente.id,
        sucursalId,
        tipoAsistencia: 'MIEMBRO',
        forzarIngreso: forzar,
        motivoForzado: motivo,
      });
    },
    onSuccess: (res) => {
      avisarIngreso(res);
      invalidarRegistros();
      handleResetSearch();
    },
    onError: (err: Error) => toast({ title: 'Acceso denegado', description: err.message, variant: 'destructive' }),
  });

  // ---------------------------------------------------------------------
  // Visitantes (invitado, pase de día, prueba gratis)
  // ---------------------------------------------------------------------
  const [nombreVisitante, setNombreVisitante] = useState('');
  const [tipoVisitante, setTipoVisitante] = useState('VISITA_DIA');

  const visitanteMutation = useMutation({
    mutationFn: async () =>
      apiPost('/asistencias/checkin', { sucursalId, tipoAsistencia: tipoVisitante, nombreVisitante: nombreVisitante.trim() }),
    onSuccess: () => {
      toast({ title: 'Visitante registrado', variant: 'success' });
      setNombreVisitante('');
      invalidarRegistros();
    },
    onError: (err: Error) => toast({ title: 'No se pudo registrar', description: err.message, variant: 'destructive' }),
  });

  const checkoutMutation = useMutation({
    mutationFn: async (id: string) => apiPatch(`/asistencias/checkout/${id}`),
    onSuccess: () => {
      toast({ title: 'Salida registrada', variant: 'default' });
      invalidarRegistros();
    },
    onError: (err: Error) => toast({ title: 'No se pudo registrar la salida', description: err.message, variant: 'destructive' }),
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: '', description: '', onConfirm: () => {} });

  function handleResetSearch() {
    setSearchTerm('');
    setSelectedCliente(null);
    setMotivoForzado('');
    validateMutation.reset();
  }

  const handleSelectCliente = (c: Cliente) => {
    setSelectedCliente(c);
    validateMutation.mutate(c.id);
  };

  const handleForzarIngreso = () => {
    if (!motivoForzado.trim()) {
      toast({ title: 'Falta motivo', description: 'Debes escribir por qué estás forzando el acceso.', variant: 'destructive' });
      return;
    }
    if (!selectedCliente) return;
    setConfirmConfig({
      title: '¿Forzar ingreso?',
      description: `Estás a punto de permitir el paso a ${selectedCliente.nombre} saltando las reglas del sistema. Esto quedará registrado en tu auditoría.`,
      onConfirm: () => checkinMutation.mutate({ forzar: true, motivo: motivoForzado }),
    });
    setConfirmOpen(true);
  };

  if (!token) return null;

  const activasList = activas || [];
  const historialList = historial || [];
  const validacion = validateMutation.data;
  const nombreDe = (r: RegistroAsistencia) => r.cliente?.nombre || r.nombreVisitante || 'Visitante';

  const renderClasesReservadas = (clases?: ClaseReservada[]) =>
    clases && clases.length > 0 ? (
      <div className="rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-500/10 p-3 text-sm text-indigo-900 dark:text-indigo-100">
        <p className="font-semibold flex items-center gap-1.5"><CalendarCheck className="w-4 h-4" /> Clases reservadas hoy</p>
        <ul className="mt-1 space-y-0.5">
          {clases.map((c) => (
            <li key={c.reservaId}>{hora(c.fechaHora)} · {c.nombreClase}</li>
          ))}
        </ul>
        <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">Al registrar el ingreso se marca la asistencia a las clases que empiezan dentro de la próxima hora o ya están en curso.</p>
      </div>
    ) : null;

  return (
    <Protect permission="asistencias:leer" fallbackType="redirect">
      <div className="p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">Control de Acceso</h2>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">Registra las entradas y salidas de miembros y visitantes.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {/* Sucursal de trabajo */}
            <label className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
              <MapPin className="w-4 h-4 text-zinc-400" />
              {sucursalFija ? (
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">{user?.sucursalNombre || sucursales.find((s) => s.id === sucursalFija)?.nombre || 'Mi sucursal'}</span>
              ) : (
                <select
                  value={sucursalId || ''}
                  onChange={(e) => cambiarSucursal(e.target.value)}
                  className="bg-transparent font-semibold text-zinc-700 dark:text-zinc-300 outline-none cursor-pointer"
                >
                  {sucursales.length === 0 && <option value="">Sin sucursales</option>}
                  {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              )}
            </label>

            {/* Mi turno de hoy */}
            {miTurno && (
              <div className="flex items-center gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
                <Briefcase className="w-4 h-4 text-zinc-400" />
                <span className="text-zinc-600 dark:text-zinc-400">
                  Mi turno: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{horaReloj(miTurno.horaEntrada)}–{horaReloj(miTurno.horaSalida)}</span>
                </span>
                {!miTurno.horaIngresoReal ? (
                  <Button size="sm" onClick={() => marcarTurnoMutation.mutate('ingreso')} disabled={marcarTurnoMutation.isPending}>Marcar entrada</Button>
                ) : !miTurno.horaSalidaReal ? (
                  <Button size="sm" variant="outline" onClick={() => marcarTurnoMutation.mutate('salida')} disabled={marcarTurnoMutation.isPending}>Marcar salida</Button>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Completado</span>
                )}
              </div>
            )}
          </div>
        </div>

        {!sucursalId ? (
          <div className="bg-amber-50 dark:bg-amber-500/20 p-6 rounded-xl border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-200 flex items-start gap-4">
            <Info className="w-6 h-6 shrink-0" />
            <div>
              <h3 className="font-bold text-lg">No hay una sucursal seleccionada</h3>
              <p className="mt-1">Crea al menos una sucursal (o selecciona una organización específica en el menú superior) para operar el control de acceso.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* PANEL IZQUIERDO: REGISTRO DE INGRESO */}
            <div className="lg:col-span-5 space-y-6">
              <Card className="border-2 border-indigo-100 dark:border-indigo-900/50 shadow-sm">
                <CardHeader className="bg-indigo-50/50 dark:bg-indigo-500/20 pb-4 border-b border-indigo-50 dark:border-indigo-900/50">
                  <CardTitle className="text-xl text-indigo-950 dark:text-indigo-100 flex items-center gap-2">
                    <Play className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    Registrar Ingreso
                  </CardTitle>
                  <CardDescription>Busca al miembro para validar su pase, o registra a un visitante.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <Tabs defaultValue="miembro" className="w-full">
                    <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 w-full">
                      <TabsTrigger value="miembro" className="flex-1 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900">
                        <UserCheck className="h-4 w-4 mr-1.5" /> Miembro
                      </TabsTrigger>
                      <TabsTrigger value="visitante" className="flex-1 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900">
                        <UserPlus className="h-4 w-4 mr-1.5" /> Visitante
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="miembro" className="mt-6 space-y-6">
                      {!selectedCliente ? (
                        <div className="space-y-4">
                          <div className="relative">
                            <Search className="absolute left-3 top-3 h-5 w-5 text-zinc-400 dark:text-zinc-500" />
                            <Input
                              autoFocus
                              placeholder="Buscar por nombre, documento o correo..."
                              className="pl-10 py-6 text-lg bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 focus-visible:ring-indigo-500"
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                            />
                          </div>
                          {debouncedSearch.length >= 2 && (
                            <div className="divide-y border rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                              {buscando && !resultados ? (
                                <div className="p-4 text-center text-zinc-500 dark:text-zinc-400">Buscando...</div>
                              ) : (resultados || []).length === 0 ? (
                                <div className="p-4 text-center text-zinc-500 dark:text-zinc-400">No se encontraron clientes</div>
                              ) : (
                                (resultados || []).map((c) => (
                                  <button
                                    type="button"
                                    key={c.id}
                                    onClick={() => handleSelectCliente(c)}
                                    className="w-full text-left p-4 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 transition-colors flex items-center gap-3"
                                  >
                                    <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-zinc-500 dark:text-zinc-400 font-bold">
                                      {c.nombre.charAt(0)}
                                    </div>
                                    <div>
                                      <p className="font-bold text-zinc-900 dark:text-white">{c.nombre}</p>
                                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{c.numeroDocumento}</p>
                                    </div>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-6 animate-in slide-in-from-right-4">
                          <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-2xl">
                              {selectedCliente.nombre.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-xl text-zinc-900 dark:text-white">{selectedCliente.nombre}</p>
                              <p className="text-sm text-zinc-500 dark:text-zinc-400">{selectedCliente.numeroDocumento}</p>
                            </div>
                          </div>

                          {/* SEMÁFORO */}
                          {validateMutation.isPending ? (
                            <div className="h-24 bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded-xl"></div>
                          ) : validacion ? (
                            validacion.allowed ? (
                              <div className="bg-emerald-50 dark:bg-emerald-500/20 border-2 border-emerald-500 rounded-xl p-5 text-emerald-900 dark:text-emerald-100 space-y-4">
                                <div className="flex items-center gap-3">
                                  <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                                  <h3 className="font-bold text-xl">ACCESO PERMITIDO</h3>
                                </div>
                                <p className="text-emerald-700 dark:text-emerald-300 font-medium">El cliente cumple con todas las reglas de su plan.</p>
                                {validacion.tipoPlan === 'SESIONES' && (
                                  <p className="text-sm bg-emerald-200/50 dark:bg-emerald-500/25 inline-block px-3 py-1 rounded-full font-bold">
                                    Sesiones restantes: {validacion.sesionesRestantes}
                                  </p>
                                )}
                                {renderClasesReservadas(validacion.clasesReservadasHoy)}
                                <Button
                                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 text-lg"
                                  onClick={() => checkinMutation.mutate({ forzar: false })}
                                  disabled={checkinMutation.isPending}
                                >
                                  {checkinMutation.isPending ? 'Registrando...' : 'Confirmar Ingreso'}
                                </Button>
                              </div>
                            ) : (
                              <div className="bg-red-50 dark:bg-red-500/20 border-2 border-red-500 rounded-xl p-5 text-red-900 dark:text-red-100 space-y-4">
                                <div className="flex items-center gap-3">
                                  <Ban className="w-8 h-8 text-red-600 dark:text-red-400" />
                                  <h3 className="font-bold text-xl">ACCESO DENEGADO</h3>
                                </div>
                                <p className="text-red-700 dark:text-red-300 font-bold text-lg">{validacion.reason}</p>
                                {renderClasesReservadas(validacion.clasesReservadasHoy)}
                                <Protect permission="asistencias:forzar" fallbackType="hide">
                                  <div className="pt-4 border-t border-red-200 dark:border-red-900/50 space-y-3">
                                    <p className="text-sm font-semibold text-red-800 dark:text-red-200">Cortesía / Forzar ingreso</p>
                                    <Input
                                      placeholder="Motivo de la excepción (obligatorio)..."
                                      className="bg-white dark:bg-slate-900 border-red-300 dark:border-red-700 focus-visible:ring-red-500"
                                      value={motivoForzado}
                                      onChange={(e) => setMotivoForzado(e.target.value)}
                                    />
                                    <Button variant="destructive" className="w-full font-bold" onClick={handleForzarIngreso} disabled={checkinMutation.isPending}>
                                      Forzar Ingreso Bajo mi Responsabilidad
                                    </Button>
                                  </div>
                                </Protect>
                              </div>
                            )
                          ) : validateMutation.isError ? (
                            <div className="bg-zinc-50 dark:bg-zinc-900 border-2 border-zinc-300 dark:border-zinc-700 rounded-xl p-5 text-zinc-700 dark:text-zinc-300 space-y-4">
                              <div className="flex items-center gap-3">
                                <Info className="w-8 h-8 text-zinc-500 dark:text-zinc-400" />
                                <h3 className="font-bold text-xl">No se pudo validar</h3>
                              </div>
                              <p className="text-zinc-600 dark:text-zinc-400">{validateMutation.error?.message || 'Ocurrió un error al consultar el estado del cliente.'}</p>
                              <Button variant="outline" className="w-full" onClick={() => validateMutation.mutate(selectedCliente.id)}>
                                Reintentar
                              </Button>
                            </div>
                          ) : null}

                          <Button variant="ghost" className="w-full text-zinc-500 dark:text-zinc-400" onClick={handleResetSearch}>
                            Cancelar / Buscar otro cliente
                          </Button>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="visitante" className="mt-6">
                      <form
                        className="space-y-4"
                        onSubmit={(e) => {
                          e.preventDefault();
                          visitanteMutation.mutate();
                        }}
                      >
                        <div className="space-y-2">
                          <label htmlFor="nombreVisitante" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Nombre del visitante</label>
                          <Input id="nombreVisitante" value={nombreVisitante} onChange={(e) => setNombreVisitante(e.target.value)} placeholder="Ej. Ana Pérez" />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="tipoVisitante" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Tipo de visita</label>
                          <select
                            id="tipoVisitante"
                            value={tipoVisitante}
                            onChange={(e) => setTipoVisitante(e.target.value)}
                            className="w-full h-10 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-slate-900 px-3 text-sm"
                          >
                            <option value="VISITA_DIA">Visita de día</option>
                            <option value="INVITADO">Invitado de un miembro</option>
                            <option value="PRUEBA_GRATIS">Prueba gratis</option>
                          </select>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Si el pase de día se cobra, registra la venta en el punto de venta.</p>
                        <Button type="submit" className="w-full" disabled={visitanteMutation.isPending || !nombreVisitante.trim()}>
                          {visitanteMutation.isPending ? 'Registrando...' : 'Registrar visitante'}
                        </Button>
                      </form>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>

            {/* PANEL DERECHO: ADENTRO / HISTORIAL */}
            <div className="lg:col-span-7">
              <Card className="h-full border-zinc-200 dark:border-zinc-800 shadow-sm">
                <Tabs defaultValue="adentro" className="w-full">
                  <CardHeader className="pb-4 border-b border-zinc-100 dark:border-zinc-800 flex flex-row justify-between items-center">
                    <TabsList className="bg-slate-100 dark:bg-slate-800 p-1">
                      <TabsTrigger value="adentro" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900">
                        <UserCheck className="h-4 w-4 mr-1.5" /> Adentro ({activasList.length})
                      </TabsTrigger>
                      <TabsTrigger value="historial" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900">
                        <History className="h-4 w-4 mr-1.5" /> Historial de hoy ({historialList.length})
                      </TabsTrigger>
                    </TabsList>
                  </CardHeader>
                  <CardContent className="p-0">
                    <TabsContent value="adentro" className="m-0">
                      {loadingActivas ? (
                        <div className="p-8 text-center text-zinc-400 dark:text-zinc-500">Cargando...</div>
                      ) : activasList.length === 0 ? (
                        <div className="p-12 text-center text-zinc-400 dark:text-zinc-500 flex flex-col items-center">
                          <UserX className="w-12 h-12 mb-3 text-zinc-300 dark:text-zinc-600" />
                          <p className="font-medium">No hay nadie registrado adentro.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[600px] overflow-y-auto">
                          {activasList.map((a) => (
                            <div key={a.id} className="p-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-700 dark:text-emerald-300 font-bold">
                                  {nombreDe(a).charAt(0)}
                                </div>
                                <div>
                                  <p className="font-bold text-zinc-900 dark:text-white">{nombreDe(a)}</p>
                                  <div className="flex gap-3 text-xs text-zinc-500 dark:text-zinc-400 font-medium mt-0.5">
                                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Ingreso: {hora(a.fechaHoraIngreso)}</span>
                                    <span className="text-indigo-600 dark:text-indigo-400">
                                      {a.membresia?.plan?.nombre || TIPO_ASISTENCIA_LABEL[a.tipoAsistencia] || 'Pase/Cortesía'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <Protect permission="asistencias:crear" fallbackType="hide">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => checkoutMutation.mutate(a.id)}
                                  disabled={checkoutMutation.isPending}
                                  className="border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                >
                                  Registrar salida
                                </Button>
                              </Protect>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="historial" className="m-0">
                      {loadingHistorial ? (
                        <div className="p-8 text-center text-zinc-400 dark:text-zinc-500">Cargando...</div>
                      ) : historialList.length === 0 ? (
                        <div className="p-12 text-center text-zinc-400 dark:text-zinc-500">Todavía no hay ingresos hoy.</div>
                      ) : (
                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[600px] overflow-y-auto">
                          {historialList.map((r) => (
                            <div key={r.id} className="p-4 text-sm flex items-start justify-between gap-4">
                              <div>
                                <p className="font-semibold text-zinc-900 dark:text-white">{nombreDe(r)}</p>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                  {TIPO_ASISTENCIA_LABEL[r.tipoAsistencia] || r.tipoAsistencia}
                                  {r.membresia?.plan?.nombre ? ` · ${r.membresia.plan.nombre}` : ''}
                                  {r.registradoPor?.nombreCompleto ? ` · registró ${r.registradoPor.nombreCompleto}` : ''}
                                </p>
                                {r.motivoAnulacion && <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{r.motivoAnulacion}</p>}
                              </div>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                                {hora(r.fechaHoraIngreso)} → {r.fechaHoraSalida ? hora(r.fechaHoraSalida) : 'adentro'}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  </CardContent>
                </Tabs>
              </Card>
            </div>
          </div>
        )}

        <GlobalConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={confirmConfig.title}
          description={confirmConfig.description}
          onConfirm={confirmConfig.onConfirm}
          isDestructive={true}
        />
      </div>
    </Protect>
  );
}
