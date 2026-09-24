"use client";

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, apiPatch, apiPut, unwrapList } from '@/lib/api-client';
import { useForm, Controller } from 'react-hook-form';
import { useSoftDelete } from '@/hooks/use-soft-delete';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { GlobalFormModal } from '@/components/ui/global-form-modal';
import { Protect } from '@/components/ui/protect';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Plus, Edit, Trash2, Search, Users, X, ArchiveRestore, CheckCircle, AlertTriangle, Repeat, UserX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PapeleraToggle } from '@/components/ui/papelera-toggle';
import { UseFormReturn } from 'react-hook-form';
import { WeeklyCalendar } from '@/components/ui/weekly-calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const ESTADO_RESERVA: Record<string, { label: string; variant: 'success' | 'primary' | 'warning' | 'default' }> = {
  CONFIRMADA: { label: 'Confirmada', variant: 'primary' },
  ASISTIO: { label: 'Asistió', variant: 'success' },
  NO_ASISTIO: { label: 'No asistió', variant: 'warning' },
  CANCELADA: { label: 'Cancelada', variant: 'default' },
};
// Mismo criterio que el backend: una reserva con asistencia marcada sigue ocupando su cupo.
const OCUPA_CUPO = (estado: string) => estado === 'CONFIRMADA' || estado === 'ASISTIO';

interface Cliente {
  id: string;
  nombre: string;
  numeroDocumento?: string | null;
}

interface Disciplina {
  id: string;
  nombre: string;
}

interface Entrenador {
  id: string;
  usuario?: { nombreCompleto: string };
}

interface Sucursal {
  id: string;
  nombre: string;
}

interface Reserva {
  id: string;
  estado: string;
  clienteId: string;
  cliente?: Cliente;
}

interface Clase {
  id: string;
  nombreClase: string;
  descripcion?: string | null;
  capacidadMaxima: number;
  duracionMinutos: number;
  fechaHora: string;
  estado: string;
  sucursalId?: string | null;
  disciplinaId?: string | null;
  entrenadorId?: string | null;
  disciplina?: Disciplina;
  entrenador?: Entrenador;
  sucursal?: Sucursal;
  reservas?: Reserva[];
}

interface ClaseFormValues {
  sucursalId: string;
  disciplinaId: string;
  entrenadorId: string;
  nombreClase: string;
  descripcion: string;
  capacidadMaxima: number | string;
  fechaHora: string;
  duracionMinutos: number | string;
  estado: string;
}

interface ClasePlantilla {
  id: string;
  sucursalId: string;
  disciplinaId?: string | null;
  entrenadorId?: string | null;
  nombreClase: string;
  descripcion?: string | null;
  capacidadMaxima: number;
  diaSemana: number;
  horaInicio: string;
  duracionMinutos: number;
  vigenciaDesde: string;
  vigenciaHasta?: string | null;
  activa: boolean;
  disciplina?: Disciplina;
  entrenador?: Entrenador;
  sucursal?: Sucursal;
}

interface SerieFormValues {
  sucursalId: string;
  disciplinaId: string;
  entrenadorId: string;
  nombreClase: string;
  descripcion: string;
  capacidadMaxima: number | string;
  diasSemana: number[];
  horaInicio: string;
  duracionMinutos: number | string;
  vigenciaDesde: string;
  vigenciaHasta: string;
  activa: boolean;
}

// Una clase recurrente = varias ClasePlantilla (una por día) con los mismos datos.
interface SerieClase {
  clave: string;
  ids: string[];
  dias: number[];
  base: ClasePlantilla;
}

interface OpcionEntrenador {
  id: string;
  nombre: string;
  imparteDisciplina: boolean | null;
  disponible: boolean | null;
  diasSinTurno: number[];
}

const horaDe = (iso: string) => new Date(iso).toISOString().substring(11, 16);
const fechaDe = (iso?: string | null) => (iso ? new Date(iso).toISOString().split('T')[0] : '');
const ordenDia = (d: number) => (d === 0 ? 7 : d); // lunes primero
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function agruparSeries(plantillas: ClasePlantilla[]): SerieClase[] {
  const grupos = new Map<string, SerieClase>();
  for (const p of plantillas) {
    const clave = [
      p.sucursalId, p.disciplinaId ?? '', p.entrenadorId ?? '', p.nombreClase, p.descripcion ?? '', p.capacidadMaxima,
      horaDe(p.horaInicio), p.duracionMinutos, fechaDe(p.vigenciaDesde), fechaDe(p.vigenciaHasta), p.activa,
    ].join('|');
    const serie = grupos.get(clave) ?? { clave, ids: [], dias: [], base: p };
    serie.ids.push(p.id);
    serie.dias.push(p.diaSemana);
    grupos.set(clave, serie);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, dias: [...new Set(g.dias)].sort((a, b) => ordenDia(a) - ordenDia(b)) }))
    .sort((a, b) => horaDe(a.base.horaInicio).localeCompare(horaDe(b.base.horaInicio)) || a.base.nombreClase.localeCompare(b.base.nombreClase));
}

const dateInputClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

// "YYYY-MM-DDTHH:mm" (lo que espera <input type="datetime-local">) <-> ISO completo.
function toDatetimeLocal(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Selector de entrenador con disponibilidad. Pide al backend la lista de
// entrenadores ordenada por quién tiene turno (clase puntual) u horario
// semanal (clase recurrente) que cubra la clase, y quién imparte la
// disciplina. No bloquea nada por sí mismo -- el bloqueo real (si la
// organización lo exige) pasa en el backend al guardar.
function SelectorEntrenador({ form, modo, sucursalFija }: { form: UseFormReturn<any>; modo: 'puntual' | 'recurrente'; sucursalFija?: string | null }) {
  const { token } = useAuth();
  const sucursalId: string = sucursalFija || form.watch('sucursalId') || '';
  const disciplinaId: string = form.watch('disciplinaId') || '';
  const duracion = Number(form.watch('duracionMinutos')) || 60;
  const fechaHoraLocal: string = modo === 'puntual' ? form.watch('fechaHora') || '' : '';
  const dias: number[] = modo === 'recurrente' ? form.watch('diasSemana') || [] : [];
  const horaInicio: string = modo === 'recurrente' ? form.watch('horaInicio') || '' : '';
  const entrenadorId: string = form.watch('entrenadorId') || '';

  const params = new URLSearchParams({ sucursalId, duracionMinutos: String(duracion) });
  if (disciplinaId) params.set('disciplinaId', disciplinaId);
  if (modo === 'puntual' && fechaHoraLocal) params.set('fechaHora', new Date(fechaHoraLocal).toISOString());
  if (modo === 'recurrente' && dias.length > 0 && horaInicio) {
    params.set('diasSemana', [...dias].sort().join(','));
    params.set('horaInicio', horaInicio);
  }

  const { data } = useQuery({
    queryKey: ['clases-entrenadores', params.toString()],
    queryFn: async () => apiGet<OpcionEntrenador[]>(`/clases/entrenadores?${params.toString()}`),
    enabled: !!token && !!sucursalId,
    placeholderData: (previo) => previo,
  });
  const opciones = data || [];
  const elegido = opciones.find((o) => o.id === entrenadorId);

  const etiqueta = (o: OpcionEntrenador) => {
    const partes: string[] = [];
    if (o.disponible === true) partes.push('Disponible');
    if (o.disponible === false) partes.push(modo === 'recurrente' ? `Sin turno: ${o.diasSinTurno.map((d) => DIAS_CORTOS[d]).join(', ')}` : 'Sin turno');
    if (o.imparteDisciplina === false) partes.push('no imparte la disciplina');
    return partes.length ? ` — ${partes.join(' · ')}` : '';
  };

  let aviso: { tono: 'ok' | 'alerta' | 'info'; texto: string } | null = null;
  if (!sucursalId) {
    aviso = { tono: 'info', texto: 'Elige la sucursal para ver quién está disponible.' };
  } else if (elegido) {
    if (elegido.disponible === false) {
      aviso = {
        tono: 'alerta',
        texto: modo === 'recurrente'
          ? `No tiene horario que cubra la clase los ${elegido.diasSinTurno.map((d) => DIAS_SEMANA[d].toLowerCase()).join(', ')}.`
          : 'No tiene turno registrado en este horario y sucursal. Puedes guardar igual, salvo que la organización exija turno asignado.',
      };
    } else if (elegido.imparteDisciplina === false) {
      aviso = { tono: 'alerta', texto: 'No tiene asignada esta disciplina en su perfil.' };
    } else if (elegido.disponible === true) {
      aviso = { tono: 'ok', texto: 'Tiene turno en este horario.' };
    } else {
      aviso = { tono: 'info', texto: modo === 'recurrente' ? 'Elige días y hora para ver su disponibilidad.' : 'Elige fecha y hora para ver su disponibilidad.' };
    }
  }
  const colorAviso = { ok: 'text-emerald-600 dark:text-emerald-400', alerta: 'text-amber-600 dark:text-amber-400', info: 'text-slate-500 dark:text-slate-400' };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Entrenador</label>
      <Controller
        name="entrenadorId"
        control={form.control}
        render={({ field }) => (
          <select value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value)} className={dateInputClass}>
            <option value="">Sin asignar</option>
            {entrenadorId && !elegido && <option value={entrenadorId}>Entrenador actual</option>}
            {opciones.map((o) => (
              <option key={o.id} value={o.id}>{o.nombre}{etiqueta(o)}</option>
            ))}
          </select>
        )}
      />
      {aviso && (
        <p className={`text-xs flex items-center gap-1.5 ${colorAviso[aviso.tono]}`}>
          {aviso.tono === 'ok' ? <CheckCircle className="h-3.5 w-3.5" /> : aviso.tono === 'alerta' ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
          {aviso.texto}
        </p>
      )}
    </div>
  );
}

export default function ClasesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const { activeTenantId } = useTenantStore();
  const userSucursalId = user?.sucursalId;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClase, setEditingClase] = useState<Clase | null>(null);
  const [viewMode, setViewMode] = useState<'calendar' | 'table'>('calendar');
  const [currentWeekDate, setCurrentWeekDate] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: '', description: '', onConfirm: () => {} });
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [reservasClaseId, setReservasClaseId] = useState<string | null>(null);
  const [clienteSearch, setClienteSearch] = useState('');

  const form = useForm({
    defaultValues: {
      sucursalId: '',
      disciplinaId: '',
      entrenadorId: '',
      nombreClase: '',
      descripcion: '',
      capacidadMaxima: 20,
      fechaHora: '',
      duracionMinutos: 60,
      estado: 'ACTIVO',
    },
  });

  const { data: clases, isLoading } = useQuery({
    queryKey: ['clases', activeTenantId, showDeleted],
    queryFn: async () => unwrapList(await apiGet(showDeleted ? '/clases?deleted=true' : '/clases')),
    enabled: !!token,
    // El calendario lo suele mirar más de una persona a la vez (recepción,
    // coordinador); sin esto, una clase creada por otro usuario/pestaña solo
    // aparece al volver a esta pestaña o tras el staleTime de 60s por defecto.
    refetchOnWindowFocus: true,
    refetchInterval: 30 * 1000,
  });

  const { data: disciplinas } = useQuery({
    queryKey: ['disciplinas', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/disciplinas')),
    enabled: !!token,
  });

  const { data: sucursales } = useQuery({
    queryKey: ['sucursales', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/sucursales')),
    enabled: !!token && !userSucursalId,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: ClaseFormValues) => {
      const payload: Record<string, unknown> = { ...values };
      if (userSucursalId) payload.sucursalId = userSucursalId;
      // Al editar, vacío = quitar (null); al crear, simplemente no se envía.
      if (!payload.disciplinaId) payload.disciplinaId = editingClase ? null : undefined;
      if (!payload.entrenadorId) payload.entrenadorId = editingClase ? null : undefined;
      payload.fechaHora = values.fechaHora ? new Date(values.fechaHora).toISOString() : undefined;
      payload.capacidadMaxima = Number(payload.capacidadMaxima) || undefined;
      payload.duracionMinutos = Number(payload.duracionMinutos) || undefined;

      return editingClase ? apiPatch(`/clases/${editingClase.id}`, payload) : apiPost('/clases', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clases'] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: 'Éxito', description: 'Clase guardada correctamente.', variant: 'success' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const { deleteItem, restoreItem, isRestoring } = useSoftDelete({
    queryKey: ['clases', activeTenantId, showDeleted],
    endpoint: 'clases',
    modelName: 'claseProgramada',
    itemName: 'La clase',
  });

  // ---- Clases recurrentes (series): una sola ficha con varios días. Crear o
  // editar genera / actualiza en el acto las clases de las próximas semanas.
  const [isPlantillaDialogOpen, setIsPlantillaDialogOpen] = useState(false);
  const [editingSerie, setEditingSerie] = useState<SerieClase | null>(null);
  const [showDeletedPlantillas, setShowDeletedPlantillas] = useState(false);
  const [confirmPlantillaConfig, setConfirmPlantillaConfig] = useState({ title: '', description: '', onConfirm: () => {} });
  const [confirmPlantillaOpen, setConfirmPlantillaOpen] = useState(false);

  const valoresSerie = (): SerieFormValues => ({
    sucursalId: userSucursalId || '',
    disciplinaId: '',
    entrenadorId: '',
    nombreClase: '',
    descripcion: '',
    capacidadMaxima: 20,
    diasSemana: [],
    horaInicio: '',
    duracionMinutos: 60,
    vigenciaDesde: toDatetimeLocal(new Date().toISOString()).slice(0, 10),
    vigenciaHasta: '',
    activa: true,
  });
  const plantillaForm = useForm<SerieFormValues>({ defaultValues: valoresSerie() });

  const { data: clasesPlantilla, isLoading: isLoadingPlantillas } = useQuery({
    queryKey: ['clases-plantilla', activeTenantId, showDeletedPlantillas],
    queryFn: async () => unwrapList(await apiGet(showDeletedPlantillas ? '/clases-plantilla?deleted=true&limit=100' : '/clases-plantilla?limit=100')),
    enabled: !!token,
  });

  const describirSerie = (r: Record<string, number | undefined>) => {
    const partes: string[] = [];
    if (r.clasesCreadas) partes.push(`${r.clasesCreadas} clases programadas`);
    if (r.clasesActualizadas) partes.push(`${r.clasesActualizadas} actualizadas`);
    if (r.clasesEliminadas) partes.push(`${r.clasesEliminadas} quitadas`);
    if (r.clasesConservadas) partes.push(`${r.clasesConservadas} conservadas porque tienen reservas`);
    if (r.clasesOmitidas) partes.push(`${r.clasesOmitidas} omitidas porque el entrenador no tiene turno y la organización lo exige`);
    return partes.length ? `${partes.join(', ')}.` : undefined;
  };

  const saveSerieMutation = useMutation({
    mutationFn: async (values: SerieFormValues) => {
      if (!values.diasSemana?.length) throw new Error('Selecciona al menos un día de la semana.');
      if (!values.horaInicio) throw new Error('Indica la hora de inicio.');
      const payload = {
        sucursalId: userSucursalId || values.sucursalId,
        disciplinaId: values.disciplinaId || null,
        entrenadorId: values.entrenadorId || null,
        nombreClase: values.nombreClase,
        descripcion: values.descripcion || null,
        capacidadMaxima: Number(values.capacidadMaxima) || 20,
        horaInicio: values.horaInicio,
        duracionMinutos: Number(values.duracionMinutos) || 60,
        vigenciaDesde: values.vigenciaDesde,
        vigenciaHasta: values.vigenciaHasta || null,
        activa: values.activa,
        diasSemana: values.diasSemana,
      };
      return editingSerie
        ? apiPut<Record<string, number>>('/clases-plantilla/serie', { ...payload, ids: editingSerie.ids })
        : apiPost<Record<string, number>>('/clases-plantilla/serie', payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['clases-plantilla'] });
      queryClient.invalidateQueries({ queryKey: ['clases'] });
      setIsPlantillaDialogOpen(false);
      toast({ title: editingSerie ? 'Clase recurrente actualizada' : 'Clase recurrente creada', description: describirSerie(res || {}), variant: 'success' });
      setEditingSerie(null);
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const eliminarSerieMutation = useMutation({
    mutationFn: async (serie: SerieClase) => apiPost<Record<string, number>>('/clases-plantilla/serie/eliminar', { ids: serie.ids }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['clases-plantilla'] });
      queryClient.invalidateQueries({ queryKey: ['clases'] });
      toast({ title: 'Clase recurrente eliminada', description: describirSerie(res || {}), variant: 'success' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  // Papelera: se restaura plantilla por plantilla (un día a la vez).
  const { restoreItem: restorePlantilla, isRestoring: isRestoringPlantilla } = useSoftDelete({
    queryKey: ['clases-plantilla', activeTenantId, showDeletedPlantillas],
    endpoint: 'clases-plantilla',
    modelName: 'clasePlantilla',
    itemName: 'La plantilla',
  });

  const handleAddNewPlantilla = () => {
    setEditingSerie(null);
    plantillaForm.reset(valoresSerie());
    setIsPlantillaDialogOpen(true);
  };

  const handleEditSerie = (serie: SerieClase) => {
    const p = serie.base;
    setEditingSerie(serie);
    plantillaForm.reset({
      sucursalId: p.sucursalId,
      disciplinaId: p.disciplinaId || '',
      entrenadorId: p.entrenadorId || '',
      nombreClase: p.nombreClase,
      descripcion: p.descripcion || '',
      capacidadMaxima: p.capacidadMaxima,
      diasSemana: serie.dias,
      horaInicio: horaDe(p.horaInicio),
      duracionMinutos: p.duracionMinutos,
      vigenciaDesde: fechaDe(p.vigenciaDesde),
      vigenciaHasta: fechaDe(p.vigenciaHasta),
      activa: p.activa,
    });
    setIsPlantillaDialogOpen(true);
  };

  const handleDeleteSerie = (serie: SerieClase) => {
    setConfirmPlantillaConfig({
      title: '¿Eliminar clase recurrente?',
      description: `Se dejará de programar "${serie.base.nombreClase}" y se quitarán sus clases futuras sin reservas (las que tienen reservas se conservan).`,
      onConfirm: () => eliminarSerieMutation.mutate(serie),
    });
    setConfirmPlantillaOpen(true);
  };

  const handleAddNew = (date?: Date) => {
    setEditingClase(null);
    form.reset({
      sucursalId: userSucursalId || '',
      disciplinaId: '',
      entrenadorId: '',
      nombreClase: '',
      descripcion: '',
      capacidadMaxima: 20,
      fechaHora: date ? toDatetimeLocal(date.toISOString()) : '',
      duracionMinutos: 60,
      estado: 'ACTIVO',
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (clase: Clase) => {
    setEditingClase(clase);
    form.reset({
      sucursalId: clase.sucursalId || '',
      disciplinaId: clase.disciplinaId || '',
      entrenadorId: clase.entrenadorId || '',
      nombreClase: clase.nombreClase,
      descripcion: clase.descripcion || '',
      capacidadMaxima: clase.capacidadMaxima,
      fechaHora: toDatetimeLocal(clase.fechaHora),
      duracionMinutos: clase.duracionMinutos,
      estado: clase.estado || 'ACTIVO',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (clase: Clase) => {
    setConfirmConfig({
      title: '¿Cancelar clase?',
      description: `Se cancelará "${clase.nombreClase}". Podrás deshacerlo en los próximos segundos.`,
      onConfirm: () => deleteItem(clase.id),
    });
    setConfirmOpen(true);
  };

  // ================= Reservas de la clase seleccionada =================
  const { data: claseDetalle, isLoading: loadingDetalle } = useQuery({
    queryKey: ['clase-detalle', reservasClaseId],
    queryFn: async () => apiGet<any>(`/clases/${reservasClaseId}`),
    enabled: !!token && !!reservasClaseId,
  });

  // Búsqueda en el servidor: antes se descargaba solo la primera página (50
  // clientes) y se filtraba en el navegador, así que el resto no aparecía.
  const clienteSearchTrim = clienteSearch.trim();
  const { data: clientes } = useQuery({
    queryKey: ['clientes', activeTenantId, 'busqueda', clienteSearchTrim],
    queryFn: async () => unwrapList(await apiGet<any>(`/clientes?search=${encodeURIComponent(clienteSearchTrim)}&limit=10`)),
    enabled: !!token && !!reservasClaseId && clienteSearchTrim.length >= 2,
  });

  const addReservaMutation = useMutation({
    mutationFn: async (clienteId: string) => apiPost('/reservas', { claseId: reservasClaseId, clienteId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clase-detalle', reservasClaseId] });
      queryClient.invalidateQueries({ queryKey: ['clases'] });
      setClienteSearch('');
      toast({ title: 'Reserva agregada', variant: 'success' });
    },
    onError: (err: Error) => toast({ title: 'No se pudo reservar', description: err.message, variant: 'destructive' }),
  });

  const marcarAsistenciaMutation = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: 'ASISTIO' | 'NO_ASISTIO' }) => apiPatch(`/reservas/${id}`, { estado }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clase-detalle', reservasClaseId] });
      queryClient.invalidateQueries({ queryKey: ['clases'] });
    },
    onError: (err: Error) => toast({ title: 'No se pudo marcar la asistencia', description: err.message, variant: 'destructive' }),
  });

  const cancelarReservaMutation = useMutation({
    mutationFn: async (id: string) => apiPatch(`/reservas/${id}/cancelar`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clase-detalle', reservasClaseId] });
      queryClient.invalidateQueries({ queryKey: ['clases'] });
      toast({ title: 'Reserva cancelada', variant: 'default' });
    },
    onError: (err: Error) => toast({ title: 'No se pudo cancelar', description: err.message, variant: 'destructive' }),
  });

  const clientesFiltrados = useMemo(() => {
    if (clienteSearchTrim.length < 2) return [];
    const yaReservados = new Set(
      (claseDetalle?.reservas || [])
        .filter((r: Reserva) => OCUPA_CUPO(r.estado))
        .map((r: Reserva) => r.clienteId)
    );
    return (unwrapList(clientes) as Cliente[]).filter((c: Cliente) => !yaReservados.has(c.id)).slice(0, 8);
  }, [clienteSearchTrim, clientes, claseDetalle]);

  if (!token) return null;

  const filteredClases = (unwrapList(clases) as Clase[]).filter((c: Clase) => {
    if (!searchTerm) return true;
    return c.nombreClase?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const plantillaList = unwrapList(clasesPlantilla) as ClasePlantilla[];
  const series = agruparSeries(plantillaList);

  return (
    <Protect permission="clases:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Clases Programadas</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Calendario de clases, cupos y reservas.</p>
        </div>

        <Tabs defaultValue="clases" className="w-full">
          <TabsList className="bg-slate-100 dark:bg-slate-800 p-1">
            <TabsTrigger value="clases" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm">
              <CalendarDays className="h-4 w-4 mr-1.5" /> Clases
            </TabsTrigger>
            <TabsTrigger value="plantillas" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm">
              <Repeat className="h-4 w-4 mr-1.5" /> Clases recurrentes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="clases" className="space-y-6 mt-4 animate-in fade-in slide-in-from-bottom-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
            Todas las clases programadas. Las que se repiten cada semana se gestionan en la pestaña
            &quot;Clases recurrentes&quot;; acá puedes crear una clase suelta o ajustar una fecha puntual.
          </p>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {viewMode === 'calendar' && (
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-1 mr-2">
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setCurrentWeekDate(new Date(currentWeekDate.getTime() - 7 * 86400000))}>
                  &lt;
                </Button>
                <Button variant="ghost" size="sm" className="h-8 px-3 text-xs font-semibold" onClick={() => setCurrentWeekDate(new Date())}>
                  Hoy
                </Button>
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setCurrentWeekDate(new Date(currentWeekDate.getTime() + 7 * 86400000))}>
                  &gt;
                </Button>
              </div>
            )}
            
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              <button 
                onClick={() => setViewMode('calendar')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'calendar' ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                Calendario
              </button>
              <button 
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'table' ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                Tabla
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Buscar clase..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 shadow-xs"
              />
            </div>
            
            <PapeleraToggle showDeleted={showDeleted} setShowDeleted={setShowDeleted} />

            <Protect permission="clases:crear" fallbackType="hide">
              <TenantRequiredButton onClick={() => handleAddNew()} icon={<Plus className="mr-2 h-4 w-4" />} label="Nueva Clase" />
            </Protect>
          </div>
        </div>

        {isLoading ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-8 flex justify-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
              <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded"></div>
            </div>
          </div>
        ) : filteredClases.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-full flex items-center justify-center mb-4">
              <CalendarDays className="w-6 h-6" />
            </div>
            <p className="text-base font-semibold text-slate-900 dark:text-white">
              {searchTerm ? 'Ninguna clase coincide con la búsqueda' : 'No hay clases programadas'}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {searchTerm ? 'Prueba con otro nombre.' : 'Programa la primera clase.'}
            </p>
          </div>
        ) : viewMode === 'calendar' ? (
          <WeeklyCalendar 
            classes={filteredClases} 
            currentDate={currentWeekDate} 
            onDateClick={handleAddNew} 
            onClassClick={handleEdit} 
            onReservaClick={(id, e) => {
              e.stopPropagation();
              setReservasClaseId(id);
            }} 
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clase</TableHead>
                <TableHead>Entrenador</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead>Fecha y Hora</TableHead>
                <TableHead>Cupos</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClases.map((c: Clase) => (
                <TableRow key={c.id} className={showDeleted ? "bg-rose-50/40 dark:bg-rose-500/20 opacity-80" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-700 dark:text-indigo-300 shrink-0">
                        <CalendarDays className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">{c.nombreClase}</p>
                        {c.disciplina?.nombre && <p className="text-xs text-slate-500 dark:text-slate-400">{c.disciplina.nombre}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600 dark:text-slate-400">{c.entrenador?.usuario?.nombreCompleto || 'Sin asignar'}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600 dark:text-slate-400">{c.sucursal?.nombre}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      {new Date(c.fechaHora).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => setReservasClaseId(c.id)}
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full hover:opacity-80 transition-opacity ${
                        (c.reservas?.length || 0) >= c.capacidadMaxima ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300' : 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                      }`}
                    >
                      <Users className="w-3 h-3" />
                      {c.reservas?.length || 0}/{c.capacidadMaxima}
                    </button>
                  </TableCell>
                  <TableCell>
                    {c.estado === 'ACTIVO' ? <Badge variant="success">Activa</Badge> : <Badge variant="default">Cancelada</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {showDeleted ? (
                        <Protect permission="sistema:restaurar">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => restoreItem(c.id)} 
                            disabled={isRestoring}
                            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 h-8 px-3"
                          >
                            <ArchiveRestore className="h-4 w-4 mr-2" /> Restaurar
                          </Button>
                        </Protect>
                      ) : (
                        <>
                          <Protect permission="clases:actualizar" fallbackType="hide">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(c)} className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </Protect>
                          <Protect permission="clases:eliminar" fallbackType="hide">
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(c)} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </Protect>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
          </TabsContent>

          <TabsContent value="plantillas" className="space-y-6 mt-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
                Define una clase que se repite cada semana (ej. &quot;Spinning, martes y jueves 18:00&quot;). Sus clases de las
                próximas semanas se crean solas al guardar, y los cambios se aplican también a las clases futuras ya creadas.
              </p>

              <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap justify-end">
                <PapeleraToggle showDeleted={showDeletedPlantillas} setShowDeleted={setShowDeletedPlantillas} />

                <Protect permission="clases:crear" fallbackType="hide">
                  <TenantRequiredButton onClick={handleAddNewPlantilla} icon={<Plus className="mr-2 h-4 w-4" />} label="Nueva clase recurrente" />
                </Protect>
              </div>
            </div>

            {isLoadingPlantillas ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-8 flex justify-center">
                <div className="animate-pulse flex flex-col items-center gap-4">
                  <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
                  <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded"></div>
                </div>
              </div>
            ) : plantillaList.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-12 text-center flex flex-col items-center">
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-full flex items-center justify-center mb-4">
                  <Repeat className="w-6 h-6" />
                </div>
                <p className="text-base font-semibold text-slate-900 dark:text-white">
                  {showDeletedPlantillas ? 'La papelera está vacía' : 'Todavía no hay clases recurrentes'}
                </p>
                {!showDeletedPlantillas && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Crea una por cada clase habitual (ej. &quot;Spinning, martes y jueves 18:00&quot;).
                  </p>
                )}
              </div>
            ) : showDeletedPlantillas ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clase</TableHead>
                    <TableHead>Día</TableHead>
                    <TableHead>Horario</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plantillaList.map((p: ClasePlantilla) => (
                    <TableRow key={p.id} className="bg-rose-50/40 dark:bg-rose-500/20 opacity-80">
                      <TableCell><span className="font-semibold text-slate-900 dark:text-white text-sm">{p.nombreClase}</span></TableCell>
                      <TableCell><span className="text-xs text-slate-600 dark:text-slate-400">{DIAS_SEMANA[p.diaSemana]}</span></TableCell>
                      <TableCell><span className="text-xs text-slate-600 dark:text-slate-400">{horaDe(p.horaInicio)} ({p.duracionMinutos} min)</span></TableCell>
                      <TableCell className="text-right">
                        <Protect permission="sistema:restaurar">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => restorePlantilla(p.id)}
                            disabled={isRestoringPlantilla}
                            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 h-8 px-3"
                          >
                            <ArchiveRestore className="h-4 w-4 mr-2" /> Restaurar
                          </Button>
                        </Protect>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clase</TableHead>
                    <TableHead>Días</TableHead>
                    <TableHead>Horario</TableHead>
                    <TableHead>Entrenador</TableHead>
                    <TableHead>Vigencia</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {series.map((serie) => {
                    const p = serie.base;
                    return (
                      <TableRow key={serie.clave}>
                        <TableCell>
                          <p className="font-semibold text-slate-900 dark:text-white text-sm">{p.nombreClase}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {[p.disciplina?.nombre, !userSucursalId ? p.sucursal?.nombre : null].filter(Boolean).join(' · ')}
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {serie.dias.map((d) => <Badge key={d} variant="primary">{DIAS_CORTOS[d]}</Badge>)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-slate-600 dark:text-slate-400">{horaDe(p.horaInicio)} · {p.duracionMinutos} min · {p.capacidadMaxima} cupos</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-slate-600 dark:text-slate-400">{p.entrenador?.usuario?.nombreCompleto || 'Sin asignar'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-slate-600 dark:text-slate-400">
                            {new Date(p.vigenciaDesde).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', timeZone: 'UTC' })}
                            {' – '}
                            {p.vigenciaHasta ? new Date(p.vigenciaHasta).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', timeZone: 'UTC' }) : 'Indefinido'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.activa ? 'success' : 'outline'}>{p.activa ? 'Activa' : 'Pausada'}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Protect permission="clases:actualizar" fallbackType="hide">
                              <Button variant="ghost" size="icon" onClick={() => handleEditSerie(serie)} className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </Protect>
                            <Protect permission="clases:eliminar" fallbackType="hide">
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteSerie(serie)} disabled={eliminarSerieMutation.isPending} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </Protect>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <GlobalFormModal
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title={editingClase ? 'Editar Clase' : 'Nueva Clase'}
        description={editingClase ? 'Modifica los datos de la clase.' : 'Programa una nueva clase.'}
        form={form as any}
        sections={[
          {
            fields: [
              { name: 'nombreClase', label: 'Nombre de la Clase', type: 'text', placeholder: 'Ej. Yoga Matutino', colSpan: 2 },
              { name: 'disciplinaId', label: 'Disciplina', type: 'select', options: [{ label: 'Ninguna', value: '' }, ...(unwrapList(disciplinas) as Disciplina[]).map((d: Disciplina) => ({ label: d.nombre, value: d.id }))] },
              ...(!userSucursalId
                ? [{
                    name: 'sucursalId',
                    label: 'Sucursal',
                    type: 'select' as const,
                    options: (unwrapList(sucursales) as Sucursal[]).map((s: Sucursal) => ({ label: s.nombre, value: s.id })),
                    colSpan: 2 as const,
                  }]
                : []),
              {
                name: 'fechaHora',
                label: 'Fecha y Hora',
                type: 'custom',
                colSpan: 2,
                renderCustom: (f: any) => (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Fecha y Hora</label>
                    <input type="datetime-local" {...f.register('fechaHora')} className={dateInputClass} />
                  </div>
                ),
              },
              {
                name: 'entrenadorId',
                label: 'Entrenador',
                type: 'custom',
                colSpan: 2,
                renderCustom: (f: any) => <SelectorEntrenador form={f} modo="puntual" sucursalFija={userSucursalId} />,
              },
              { name: 'duracionMinutos', label: 'Duración (min)', type: 'number' },
              { name: 'capacidadMaxima', label: 'Capacidad Máxima', type: 'number' },
              { name: 'estado', label: 'Estado', type: 'select', options: [{ label: 'Activa', value: 'ACTIVO' }, { label: 'Cancelada', value: 'INACTIVO' }] },
              { name: 'descripcion', label: 'Descripción (Opcional)', type: 'text', colSpan: 2 },
            ],
          },
        ]}
        onSubmit={saveMutation.mutateAsync as any}
        isPending={saveMutation.isPending}
        submitLabel="Guardar Clase"
      />

      <GlobalConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        onConfirm={confirmConfig.onConfirm}
        isDestructive={true}
      />

      <GlobalFormModal
        open={isPlantillaDialogOpen}
        onOpenChange={setIsPlantillaDialogOpen}
        title={editingSerie ? 'Editar clase recurrente' : 'Nueva clase recurrente'}
        description={editingSerie ? 'Los cambios se aplican también a las clases futuras ya programadas.' : 'Una clase que se repite cada semana en los días que elijas.'}
        form={plantillaForm as any}
        maxWidthClass="sm:max-w-[600px]"
        sections={[
          {
            fields: [
              { name: 'nombreClase', label: 'Nombre de la clase', type: 'text', placeholder: 'Ej. Spinning', colSpan: 2 },
              { name: 'disciplinaId', label: 'Disciplina', type: 'select', options: [{ label: 'Ninguna', value: '' }, ...(unwrapList(disciplinas) as Disciplina[]).map((d: Disciplina) => ({ label: d.nombre, value: d.id }))] },
              ...(!userSucursalId
                ? [{
                    name: 'sucursalId',
                    label: 'Sucursal',
                    type: 'select' as const,
                    options: (unwrapList(sucursales) as Sucursal[]).map((s: Sucursal) => ({ label: s.nombre, value: s.id })),
                  }]
                : []),
              {
                name: 'diasSemana',
                label: 'Días de la semana',
                type: 'custom',
                colSpan: 2,
                renderCustom: (f: any) => {
                  const seleccionados: number[] = f.watch('diasSemana') || [];
                  const toggle = (dia: number) => {
                    const set = new Set(seleccionados);
                    if (set.has(dia)) set.delete(dia); else set.add(dia);
                    f.setValue('diasSemana', Array.from(set).sort((a, b) => ordenDia(a) - ordenDia(b)), { shouldDirty: true });
                  };
                  return (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Días de la semana</label>
                      <div className="flex flex-wrap gap-2">
                        {[1, 2, 3, 4, 5, 6, 0].map((value) => {
                          const active = seleccionados.includes(value);
                          return (
                            <button
                              type="button"
                              key={value}
                              onClick={() => toggle(value)}
                              aria-pressed={active}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                active
                                  ? 'bg-indigo-600 border-indigo-600 text-white'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-700'
                              }`}
                            >
                              {DIAS_CORTOS[value]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                },
              },
              {
                name: 'horaInicio',
                label: 'Hora de inicio',
                type: 'custom',
                renderCustom: (f: any) => (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Hora de inicio</label>
                    <input type="time" {...f.register('horaInicio')} className={dateInputClass} />
                  </div>
                ),
              },
              { name: 'duracionMinutos', label: 'Duración (min)', type: 'number' },
              {
                name: 'entrenadorId',
                label: 'Entrenador',
                type: 'custom',
                colSpan: 2,
                renderCustom: (f: any) => <SelectorEntrenador form={f} modo="recurrente" sucursalFija={userSucursalId} />,
              },
              { name: 'capacidadMaxima', label: 'Cupos por clase', type: 'number' },
              {
                name: 'activa',
                label: 'Estado',
                type: 'custom',
                renderCustom: (f: any) => (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Activa</label>
                    <div className="flex items-center h-10 gap-2">
                      <Switch checked={f.watch('activa')} onCheckedChange={(c: boolean) => f.setValue('activa', c, { shouldDirty: true })} />
                      <span className="text-xs text-slate-500 dark:text-slate-400">{f.watch('activa') ? 'Se programa cada semana' : 'Pausada: no se programan clases'}</span>
                    </div>
                  </div>
                ),
              },
              {
                name: 'vigenciaDesde',
                label: 'Desde',
                type: 'custom',
                renderCustom: (f: any) => (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Desde</label>
                    <input type="date" {...f.register('vigenciaDesde')} className={dateInputClass} />
                  </div>
                ),
              },
              {
                name: 'vigenciaHasta',
                label: 'Hasta (opcional)',
                type: 'custom',
                renderCustom: (f: any) => (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Hasta (opcional)</label>
                    <input type="date" {...f.register('vigenciaHasta')} className={dateInputClass} />
                  </div>
                ),
              },
              { name: 'descripcion', label: 'Descripción (opcional)', type: 'text', colSpan: 2 },
            ],
          },
        ]}
        onSubmit={saveSerieMutation.mutateAsync as any}
        isPending={saveSerieMutation.isPending}
        submitLabel={editingSerie ? 'Guardar cambios' : 'Crear clase recurrente'}
      />

      <GlobalConfirmDialog
        open={confirmPlantillaOpen}
        onOpenChange={setConfirmPlantillaOpen}
        title={confirmPlantillaConfig.title}
        description={confirmPlantillaConfig.description}
        onConfirm={confirmPlantillaConfig.onConfirm}
        isDestructive={true}
      />

      {/* ================= Reservas de la clase ================= */}
      <Dialog open={!!reservasClaseId} onOpenChange={(open) => { if (!open) { setReservasClaseId(null); setClienteSearch(''); } }}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Reservas de {claseDetalle?.nombreClase}</DialogTitle>
            <DialogDescription>
              {claseDetalle ? `${(claseDetalle.reservas || []).filter((r: Reserva) => OCUPA_CUPO(r.estado)).length}/${claseDetalle.capacidadMaxima} cupos ocupados` : 'Cargando...'}
            </DialogDescription>
          </DialogHeader>

          {loadingDetalle ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 py-4">Cargando reservas...</p>
          ) : (
            <div className="space-y-4">
              <Protect permission="reservas:crear" fallbackType="hide">
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                    <Input
                      placeholder="Buscar cliente para agregar..."
                      className="pl-9"
                      value={clienteSearch}
                      onChange={(e) => setClienteSearch(e.target.value)}
                    />
                  </div>
                  {clienteSearchTrim.length >= 2 && (
                    <div className="divide-y border rounded-lg overflow-hidden bg-white dark:bg-slate-900 max-h-40 overflow-y-auto">
                      {clientesFiltrados.length === 0 ? (
                        <div className="p-3 text-center text-xs text-zinc-500 dark:text-zinc-400">Sin resultados</div>
                      ) : (
                        clientesFiltrados.map((c: Cliente) => (
                          <button
                            key={c.id}
                            onClick={() => addReservaMutation.mutate(c.id)}
                            disabled={addReservaMutation.isPending}
                            className="w-full text-left p-2.5 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-500/20 transition-colors flex items-center justify-between"
                          >
                            <span>{c.nombre}</span>
                            <Plus className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </Protect>

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {(claseDetalle?.reservas || []).length === 0 ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-6">Todavía no hay reservas para esta clase.</p>
                ) : (
                  (claseDetalle.reservas as Reserva[]).map((r: Reserva) => (
                    <div key={r.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{r.cliente?.nombre}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{r.cliente?.numeroDocumento}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={ESTADO_RESERVA[r.estado]?.variant ?? 'default'}>{ESTADO_RESERVA[r.estado]?.label ?? r.estado}</Badge>
                        {r.estado !== 'CANCELADA' && (
                          <Protect permission="reservas:actualizar" fallbackType="hide">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Asistió"
                              className={`h-7 w-7 ${r.estado === 'ASISTIO' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500 hover:text-emerald-600'}`}
                              onClick={() => marcarAsistenciaMutation.mutate({ id: r.id, estado: 'ASISTIO' })}
                              disabled={marcarAsistenciaMutation.isPending || r.estado === 'ASISTIO'}
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="No asistió"
                              className={`h-7 w-7 ${r.estado === 'NO_ASISTIO' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500 hover:text-amber-600'}`}
                              onClick={() => marcarAsistenciaMutation.mutate({ id: r.id, estado: 'NO_ASISTIO' })}
                              disabled={marcarAsistenciaMutation.isPending || r.estado === 'NO_ASISTIO'}
                            >
                              <UserX className="h-3.5 w-3.5" />
                            </Button>
                          </Protect>
                        )}
                        {r.estado === 'CONFIRMADA' && (
                          <Protect permission="reservas:eliminar" fallbackType="hide">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
                              onClick={() => cancelarReservaMutation.mutate(r.id)}
                              disabled={cancelarReservaMutation.isPending}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </Protect>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Protect>
  );
}
