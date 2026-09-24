"use client";

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, apiPatch, unwrapList } from '@/lib/api-client';
import { useForm } from 'react-hook-form';
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
import { CalendarDays, Plus, Edit, Trash2, Search, Users, X, ArchiveRestore, CheckCircle, AlertTriangle, Repeat, Sparkles, Info, UserX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PapeleraToggle } from '@/components/ui/papelera-toggle';
import { Label } from '@/components/ui/label';
import { UseFormReturn } from 'react-hook-form';
import { WeeklyCalendar } from '@/components/ui/weekly-calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

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

interface ClasePlantillaFormValues {
  sucursalId: string;
  disciplinaId: string;
  entrenadorId: string;
  nombreClase: string;
  descripcion: string;
  capacidadMaxima: number | string;
  // Al editar se cambia un solo día; al crear se pueden tildar varios que
  // comparten horario (mismo patrón que las plantillas de turno).
  diaSemana: number | string;
  diasSemana: number[];
  horaInicio: string;
  duracionMinutos: number | string;
  vigenciaDesde: string;
  vigenciaHasta: string;
  activa: boolean;
}

const dateInputClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

// "YYYY-MM-DDTHH:mm" (lo que espera <input type="datetime-local">) <-> ISO completo.
function toDatetimeLocal(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Aviso en vivo mientras se completa el formulario: consulta si el entrenador
// elegido tiene un turno de trabajo que cubra ese horario y sucursal. No
// bloquea nada por sí mismo -- el bloqueo real (si la organización lo exige)
// pasa en el backend al guardar (ver clase-programada.service.ts).
function AvisoDisponibilidadEntrenador({ form }: { form: UseFormReturn<any> }) {
  const entrenadorId = form.watch('entrenadorId');
  const sucursalId = form.watch('sucursalId');
  const fechaHoraLocal = form.watch('fechaHora');
  const duracionMinutos = form.watch('duracionMinutos');
  const { token } = useAuth();

  const habilitado = !!token && !!entrenadorId && !!sucursalId && !!fechaHoraLocal;

  const { data, isFetching } = useQuery({
    queryKey: ['clases-disponibilidad', entrenadorId, sucursalId, fechaHoraLocal, duracionMinutos],
    queryFn: async () => {
      const fechaHora = new Date(fechaHoraLocal).toISOString();
      const params = new URLSearchParams({
        entrenadorId,
        sucursalId,
        fechaHora,
        duracionMinutos: String(Number(duracionMinutos) || 60),
      });
      return apiGet(`/clases/disponibilidad?${params.toString()}`);
    },
    enabled: habilitado,
    staleTime: 0,
  });

  if (!habilitado || isFetching || !data) return null;
  if ((data as { disponible?: boolean }).disponible) {
    return (
      <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mt-1">
        <CheckCircle className="h-3.5 w-3.5" /> El entrenador tiene turno registrado en este horario.
      </p>
    );
  }
  return (
    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 mt-1">
      <AlertTriangle className="h-3.5 w-3.5" /> Este entrenador no tiene turno registrado en este horario y sucursal. Puedes
      guardar igual, salvo que la organización exija turno asignado.
    </p>
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

  const { data: personal } = useQuery({
    queryKey: ['personal', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/personal')),
    enabled: !!token,
  });

  const { data: sucursales } = useQuery({
    queryKey: ['sucursales', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/sucursales')),
    enabled: !!token && !userSucursalId,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: ClaseFormValues) => {
      const payload: Partial<ClaseFormValues> = { ...values };
      if (userSucursalId) payload.sucursalId = userSucursalId;
      if (!payload.disciplinaId) delete payload.disciplinaId;
      if (!payload.entrenadorId) delete payload.entrenadorId;
      payload.fechaHora = payload.fechaHora ? new Date(payload.fechaHora).toISOString() : undefined;
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

  // ---- Plantillas recurrentes de clase: mismo concepto que las plantillas
  // de turno -- se define una vez por día de la semana y un job (nocturno, o
  // el botón "Generar clases ahora") materializa las ClaseProgramada de las
  // próximas semanas a partir de esto, en vez de crear cada clase a mano.
  const [isPlantillaDialogOpen, setIsPlantillaDialogOpen] = useState(false);
  const [editingPlantilla, setEditingPlantilla] = useState<ClasePlantilla | null>(null);
  const [showDeletedPlantillas, setShowDeletedPlantillas] = useState(false);
  const [confirmPlantillaConfig, setConfirmPlantillaConfig] = useState({ title: '', description: '', onConfirm: () => {} });
  const [confirmPlantillaOpen, setConfirmPlantillaOpen] = useState(false);
  const [semanasGenerarClases, setSemanasGenerarClases] = useState(8);

  const plantillaForm = useForm<ClasePlantillaFormValues>({
    defaultValues: {
      sucursalId: '',
      disciplinaId: '',
      entrenadorId: '',
      nombreClase: '',
      descripcion: '',
      capacidadMaxima: 20,
      diaSemana: 1,
      diasSemana: [],
      horaInicio: '',
      duracionMinutos: 60,
      vigenciaDesde: '',
      vigenciaHasta: '',
      activa: true,
    },
  });

  const { data: clasesPlantilla, isLoading: isLoadingPlantillas } = useQuery({
    queryKey: ['clases-plantilla', activeTenantId, showDeletedPlantillas],
    queryFn: async () => unwrapList(await apiGet(showDeletedPlantillas ? '/clases-plantilla?deleted=true' : '/clases-plantilla')),
    enabled: !!token,
  });

  const savePlantillaMutation = useMutation({
    mutationFn: async (values: ClasePlantillaFormValues) => {
      const base: Record<string, unknown> = {
        sucursalId: userSucursalId || values.sucursalId,
        nombreClase: values.nombreClase,
        descripcion: values.descripcion || undefined,
        capacidadMaxima: Number(values.capacidadMaxima) || 20,
        horaInicio: values.horaInicio,
        duracionMinutos: Number(values.duracionMinutos) || 60,
        vigenciaDesde: values.vigenciaDesde,
        activa: values.activa,
      };
      if (values.disciplinaId) base.disciplinaId = values.disciplinaId;
      if (values.entrenadorId) base.entrenadorId = values.entrenadorId;
      if (values.vigenciaHasta) base.vigenciaHasta = values.vigenciaHasta;

      if (editingPlantilla) {
        return apiPatch(`/clases-plantilla/${editingPlantilla.id}`, { ...base, diaSemana: Number(values.diaSemana) });
      }

      const dias = values.diasSemana ?? [];
      if (dias.length === 0) {
        throw new Error('Selecciona al menos un día de la semana.');
      }
      return Promise.all(dias.map((dia) => apiPost('/clases-plantilla', { ...base, diaSemana: dia })));
    },
    onSuccess: (_data, values) => {
      queryClient.invalidateQueries({ queryKey: ['clases-plantilla'] });
      setIsPlantillaDialogOpen(false);
      plantillaForm.reset();
      const cantidadDias = editingPlantilla ? 1 : (values.diasSemana ?? []).length;
      toast({
        title: 'Éxito',
        description: editingPlantilla
          ? 'Plantilla de clase actualizada correctamente.'
          : cantidadDias > 1
            ? `Se crearon ${cantidadDias} plantillas de clase (una por día seleccionado).`
            : 'Plantilla de clase creada correctamente.',
        variant: 'success',
      });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const { deleteItem: deletePlantilla, restoreItem: restorePlantilla, isRestoring: isRestoringPlantilla } = useSoftDelete({
    queryKey: ['clases-plantilla', activeTenantId, showDeletedPlantillas],
    endpoint: 'clases-plantilla',
    modelName: 'clasePlantilla',
    itemName: 'La plantilla',
  });

  const generarClasesMutation = useMutation({
    mutationFn: async () => apiPost(`/clases-plantilla/generar?semanas=${semanasGenerarClases}`, {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['clases'] });
      const creadas = data?.clasesCreadas ?? 0;
      const omitidas = data?.clasesOmitidas ?? 0;
      const partes = [
        creadas > 0
          ? `Se crearon ${creadas} clases nuevas a partir de las plantillas activas (próximas ${semanasGenerarClases} semanas).`
          : `Las plantillas activas ya tenían todas sus clases generadas para las próximas ${semanasGenerarClases} semanas.`,
      ];
      if (omitidas > 0) {
        partes.push(`${omitidas} no se generaron porque el entrenador no tenía turno registrado y la organización lo exige.`);
      }
      toast({ title: 'Clases generadas', description: partes.join(' '), variant: 'success' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const handleAddNewPlantilla = () => {
    setEditingPlantilla(null);
    plantillaForm.reset({
      sucursalId: userSucursalId || '',
      disciplinaId: '',
      entrenadorId: '',
      nombreClase: '',
      descripcion: '',
      capacidadMaxima: 20,
      diaSemana: 1,
      diasSemana: [],
      horaInicio: '',
      duracionMinutos: 60,
      vigenciaDesde: new Date().toISOString().split('T')[0],
      vigenciaHasta: '',
      activa: true,
    });
    setIsPlantillaDialogOpen(true);
  };

  const handleEditPlantilla = (plantilla: ClasePlantilla) => {
    setEditingPlantilla(plantilla);
    plantillaForm.reset({
      sucursalId: plantilla.sucursalId,
      disciplinaId: plantilla.disciplinaId || '',
      entrenadorId: plantilla.entrenadorId || '',
      nombreClase: plantilla.nombreClase,
      descripcion: plantilla.descripcion || '',
      capacidadMaxima: plantilla.capacidadMaxima,
      diaSemana: plantilla.diaSemana,
      diasSemana: [plantilla.diaSemana],
      horaInicio: plantilla.horaInicio ? new Date(plantilla.horaInicio).toISOString().substring(11, 16) : '',
      duracionMinutos: plantilla.duracionMinutos,
      vigenciaDesde: plantilla.vigenciaDesde ? new Date(plantilla.vigenciaDesde).toISOString().split('T')[0] : '',
      vigenciaHasta: plantilla.vigenciaHasta ? new Date(plantilla.vigenciaHasta).toISOString().split('T')[0] : '',
      activa: plantilla.activa,
    });
    setIsPlantillaDialogOpen(true);
  };

  const handleDeletePlantilla = (id: string) => {
    setConfirmPlantillaConfig({
      title: '¿Eliminar plantilla?',
      description: 'No borra las clases ya generadas, solo detiene nuevas proyecciones. Podrás deshacerlo en los próximos segundos.',
      onConfirm: () => deletePlantilla(id),
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

  const personalList = unwrapList(personal);
  const filteredClases = (unwrapList(clases) as Clase[]).filter((c: Clase) => {
    if (!searchTerm) return true;
    return c.nombreClase?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const plantillaList = unwrapList(clasesPlantilla) as ClasePlantilla[];

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
              <Repeat className="h-4 w-4 mr-1.5" /> Plantillas recurrentes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="clases" className="space-y-6 mt-4 animate-in fade-in slide-in-from-bottom-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
            Clases puntuales. Para no crear cada semana a mano, define un horario recurrente en la pestaña
            &quot;Plantillas recurrentes&quot;.
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
                Define el horario semanal habitual de una clase una sola vez (ej. &quot;Yoga, Lunes/Miércoles/Viernes 07:00&quot;).
                Todas las noches (o cuando aprietes &quot;Generar clases ahora&quot;) el sistema crea las clases individuales de
                las próximas semanas a partir de esto.
              </p>

              <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap justify-end">
                <PapeleraToggle showDeleted={showDeletedPlantillas} setShowDeleted={setShowDeletedPlantillas} />

                <Protect permission="clases:crear" fallbackType="hide">
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-1 pr-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                          <Info className="h-4 w-4" />
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          Crea, a partir de tus plantillas activas, las clases individuales reales de las próximas N semanas (no
                          duplica las que ya existen; si el entrenador no tiene turno y la organización lo exige, esa clase
                          puntual se omite). Esto mismo corre automáticamente todas las noches; el botón es para no esperar
                          hasta entonces.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <Label htmlFor="semanas-generar-clases" className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      Semanas:
                    </Label>
                    <input
                      id="semanas-generar-clases"
                      type="number"
                      min={1}
                      max={26}
                      value={semanasGenerarClases}
                      onChange={(e) => setSemanasGenerarClases(Math.min(26, Math.max(1, Number(e.target.value) || 1)))}
                      className="w-14 h-8 text-xs text-center rounded-md border border-slate-200 dark:border-slate-700 bg-transparent"
                    />

                    <Button
                      variant="outline"
                      onClick={() => generarClasesMutation.mutate()}
                      disabled={generarClasesMutation.isPending}
                      className="border-none shadow-none text-indigo-700 dark:text-indigo-400"
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      {generarClasesMutation.isPending ? 'Generando...' : 'Generar clases ahora'}
                    </Button>
                  </div>
                </Protect>

                <Protect permission="clases:crear" fallbackType="hide">
                  <TenantRequiredButton onClick={handleAddNewPlantilla} icon={<Plus className="mr-2 h-4 w-4" />} label="Nueva Plantilla" />
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
                <p className="text-base font-semibold text-slate-900 dark:text-white">No hay plantillas de clase registradas</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Crea una plantilla por cada horario semanal habitual (ej. &quot;Spinning Martes y Jueves 18:00&quot;).
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clase</TableHead>
                    <TableHead>Entrenador</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead>Día</TableHead>
                    <TableHead>Horario</TableHead>
                    <TableHead>Vigencia</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plantillaList.map((p: ClasePlantilla) => (
                    <TableRow key={p.id} className={showDeletedPlantillas ? "bg-rose-50/40 dark:bg-rose-500/20 opacity-80" : ""}>
                      <TableCell>
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white text-sm">{p.nombreClase}</p>
                          {p.disciplina?.nombre && <p className="text-xs text-slate-500 dark:text-slate-400">{p.disciplina.nombre}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600 dark:text-slate-400">{p.entrenador?.usuario?.nombreCompleto || 'Sin asignar'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600 dark:text-slate-400">{p.sucursal?.nombre}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600 dark:text-slate-400">{DIAS_SEMANA[p.diaSemana]}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600 dark:text-slate-400">
                          {new Date(p.horaInicio).toISOString().substring(11, 16)} ({p.duracionMinutos} min)
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600 dark:text-slate-400">
                          {new Date(p.vigenciaDesde).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', timeZone: 'UTC' })}
                          {' – '}
                          {p.vigenciaHasta ? new Date(p.vigenciaHasta).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', timeZone: 'UTC' }) : 'Indefinido'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.activa ? 'success' : 'outline'}>{p.activa ? 'Activa' : 'Inactiva'}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {showDeletedPlantillas ? (
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
                          ) : (
                            <>
                              <Protect permission="clases:actualizar" fallbackType="hide">
                                <Button variant="ghost" size="icon" onClick={() => handleEditPlantilla(p)} className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </Protect>
                              <Protect permission="clases:eliminar" fallbackType="hide">
                                <Button variant="ghost" size="icon" onClick={() => handleDeletePlantilla(p.id)} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400">
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
              { name: 'entrenadorId', label: 'Entrenador', type: 'select', options: [{ label: 'Sin asignar', value: '' }, ...(personalList as Entrenador[]).map((p: Entrenador) => ({ label: p.usuario?.nombreCompleto || 'Sin nombre', value: p.id }))] },
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
                    <AvisoDisponibilidadEntrenador form={f} />
                  </div>
                ),
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
        title={editingPlantilla ? 'Editar Plantilla de Clase' : 'Nueva Plantilla de Clase'}
        description={editingPlantilla ? 'Modifica el horario semanal recurrente.' : 'Define un horario que se repite cada semana.'}
        form={plantillaForm as any}
        sections={[
          {
            fields: [
              { name: 'nombreClase', label: 'Nombre de la Clase', type: 'text', placeholder: 'Ej. Yoga Matutino', colSpan: 2 },
              { name: 'disciplinaId', label: 'Disciplina', type: 'select', options: [{ label: 'Ninguna', value: '' }, ...(unwrapList(disciplinas) as Disciplina[]).map((d: Disciplina) => ({ label: d.nombre, value: d.id }))] },
              { name: 'entrenadorId', label: 'Entrenador', type: 'select', options: [{ label: 'Sin asignar', value: '' }, ...(personalList as Entrenador[]).map((p: Entrenador) => ({ label: p.usuario?.nombreCompleto || 'Sin nombre', value: p.id }))] },
              ...(!userSucursalId
                ? [{
                    name: 'sucursalId',
                    label: 'Sucursal',
                    type: 'select' as const,
                    options: (unwrapList(sucursales) as Sucursal[]).map((s: Sucursal) => ({ label: s.nombre, value: s.id })),
                    colSpan: 2 as const,
                  }]
                : []),
              editingPlantilla
                ? {
                    name: 'diaSemana',
                    label: 'Día de la semana',
                    type: 'select' as const,
                    options: DIAS_SEMANA.map((label, value) => ({ label, value: String(value) })),
                  }
                : {
                    name: 'diasSemana',
                    label: 'Días de la semana',
                    type: 'custom' as const,
                    colSpan: 2 as const,
                    renderCustom: (f: any) => {
                      const seleccionados: number[] = f.watch('diasSemana') || [];
                      const toggle = (dia: number) => {
                        const set = new Set(seleccionados);
                        if (set.has(dia)) set.delete(dia); else set.add(dia);
                        f.setValue('diasSemana', Array.from(set).sort(), { shouldDirty: true });
                      };
                      return (
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Días de la semana</label>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Tilda todos los días que comparten este mismo horario, entrenador y sucursal (ej. Lunes, Miércoles
                            y Viernes). Si un día tiene un horario distinto, créalo aparte en otra plantilla.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {DIAS_SEMANA.map((label, value) => {
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
                                  {label.slice(0, 3)}
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
                label: 'Hora de Inicio',
                type: 'custom',
                renderCustom: (f: any) => (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Hora de Inicio</label>
                    <input type="time" {...f.register('horaInicio')} className={dateInputClass} />
                  </div>
                ),
              },
              { name: 'duracionMinutos', label: 'Duración (min)', type: 'number' },
              { name: 'capacidadMaxima', label: 'Capacidad Máxima', type: 'number' },
              {
                name: 'activa',
                label: 'Estado',
                type: 'custom',
                renderCustom: (f: any) => (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Plantilla activa</label>
                    <div className="flex items-center h-10">
                      <Switch checked={f.watch('activa')} onCheckedChange={(c: boolean) => f.setValue('activa', c, { shouldDirty: true })} />
                    </div>
                  </div>
                ),
              },
              {
                name: 'vigenciaDesde',
                label: 'Vigente desde',
                type: 'custom',
                renderCustom: (f: any) => (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Vigente desde</label>
                    <input type="date" {...f.register('vigenciaDesde')} className={dateInputClass} />
                  </div>
                ),
              },
              {
                name: 'vigenciaHasta',
                label: 'Vigente hasta (Opcional)',
                type: 'custom',
                renderCustom: (f: any) => (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Vigente hasta (Opcional)</label>
                    <input type="date" {...f.register('vigenciaHasta')} className={dateInputClass} />
                  </div>
                ),
              },
              { name: 'descripcion', label: 'Descripción (Opcional)', type: 'text', colSpan: 2 },
            ],
          },
        ]}
        onSubmit={savePlantillaMutation.mutateAsync as any}
        isPending={savePlantillaMutation.isPending}
        submitLabel="Guardar Plantilla"
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
