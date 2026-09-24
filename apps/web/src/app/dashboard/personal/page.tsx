"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPatch, apiPost, unwrapList } from '@/lib/api-client';
import { useForm, Controller, UseFormReturn, FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSoftDelete } from '@/hooks/use-soft-delete';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { GlobalFormModal } from '@/components/ui/global-form-modal';
import { Protect } from '@/components/ui/protect';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { UserCog, Plus, Edit, Trash2, Search, ArchiveRestore, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PapeleraToggle } from '@/components/ui/papelera-toggle';

const TIPO_CONTRATACION_LABEL: Record<string, string> = {
  PLANILLA: 'Planilla',
  INDEPENDIENTE: 'Independiente',
  VOLUNTARIO: 'Voluntario',
};

// Orden de la grilla: lunes primero. El valor es el diaSemana del backend (0 = domingo).
const DIAS_GRILLA = [
  { dia: 1, label: 'Lunes', corto: 'Lun' },
  { dia: 2, label: 'Martes', corto: 'Mar' },
  { dia: 3, label: 'Miércoles', corto: 'Mié' },
  { dia: 4, label: 'Jueves', corto: 'Jue' },
  { dia: 5, label: 'Viernes', corto: 'Vie' },
  { dia: 6, label: 'Sábado', corto: 'Sáb' },
  { dia: 0, label: 'Domingo', corto: 'Dom' },
];
const DIA_CORTO: Record<number, string> = Object.fromEntries(DIAS_GRILLA.map((d) => [d.dia, d.corto]));

// Roles globales que no corresponden a un empleado (el backend también los rechaza).
const ROLES_NO_ASIGNABLES = ['SUPERADMIN', 'CLIENTE'];

interface Rol { id: string; nombre: string; }
interface Sucursal { id: string; nombre: string; }
interface Disciplina { id: string; nombre: string; }

interface Staff {
  id: string;
  usuarioId: string;
  tipoContratacion: string;
  costoPorHora: number | string;
  comisionPorcentaje?: number | string | null;
  estado: string;
  usuario?: {
    nombreCompleto: string;
    correo: string;
    telefono?: string | null;
    asignacionesAcceso?: { id: string; rolId: string; sucursalId: string | null; rol?: { nombre: string } }[];
  };
  staffDisciplinas?: { disciplinaId: string; disciplina?: Disciplina }[];
  turnosPlantilla?: { diaSemana: number; horaEntrada: string; horaSalida: string; sucursalId: string }[];
}

interface ResumenHorario {
  turnosCreados: number;
  turnosActualizados: number;
  turnosEliminados: number;
  turnosConservados: number;
}

const horaDe = (iso: string) => new Date(iso).toISOString().substring(11, 16);

const diaSchema = z.object({ activo: z.boolean(), entrada: z.string(), salida: z.string() });

const miembroSchema = z
  .object({
    modo: z.enum(['crear', 'editar']),
    nombreCompleto: z.string().trim().min(2, 'Ingresa el nombre completo'),
    // Opcionales: en edición el correo va deshabilitado (react-hook-form entrega
    // undefined para campos disabled) y la contraseña no se muestra.
    correo: z.string().optional(),
    contrasena: z.string().optional(),
    telefono: z.string(),
    rolId: z.string().min(1, 'Elige un rol'),
    sucursalAccesoId: z.string(),
    tipoContratacion: z.string(),
    estado: z.string(),
    costoPorHora: z.union([z.string(), z.number()]),
    comisionPorcentaje: z.union([z.string(), z.number()]),
    disciplinaIds: z.array(z.string()),
    horarioSucursalId: z.string(),
    dias: z.array(diaSchema).length(7),
  })
  .superRefine((v, ctx) => {
    if (v.modo === 'crear') {
      if (!z.string().email().safeParse(v.correo ?? '').success) {
        ctx.addIssue({ code: 'custom', path: ['correo'], message: 'Correo inválido' });
      }
      if ((v.contrasena ?? '').length < 8) {
        ctx.addIssue({ code: 'custom', path: ['contrasena'], message: 'Mínimo 8 caracteres' });
      }
    }
    const activos = v.dias.filter((d) => d.activo);
    if (activos.length > 0 && !v.horarioSucursalId) {
      ctx.addIssue({ code: 'custom', path: ['horarioSucursalId'], message: 'Elige en qué sucursal trabaja' });
    }
    v.dias.forEach((d, i) => {
      if (!d.activo) return;
      if (!d.entrada || !d.salida || d.salida <= d.entrada) {
        ctx.addIssue({ code: 'custom', path: ['dias', i, 'salida'], message: 'La salida debe ser posterior a la entrada' });
      }
    });
  });

type MiembroFormValues = z.infer<typeof miembroSchema>;

const diasVacios = () => Array.from({ length: 7 }, () => ({ activo: false, entrada: '08:00', salida: '16:00' }));

// "Lun, Mié, Vie · 06:00–14:00" (agrupa días con el mismo horario).
function resumirHorario(bloques: Staff['turnosPlantilla']): string[] {
  if (!bloques || bloques.length === 0) return [];
  const grupos = new Map<string, number[]>();
  for (const b of bloques) {
    const clave = `${horaDe(b.horaEntrada)}–${horaDe(b.horaSalida)}`;
    grupos.set(clave, [...(grupos.get(clave) || []), b.diaSemana]);
  }
  const orden = (d: number) => (d === 0 ? 7 : d);
  return [...grupos.entries()].map(([horas, dias]) => `${dias.sort((a, b) => orden(a) - orden(b)).map((d) => DIA_CORTO[d]).join(', ')} · ${horas}`);
}

export default function PersonalPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token } = useAuth();
  const { activeTenantId } = useTenantStore();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPersonal, setEditingPersonal] = useState<Staff | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: '', description: '', onConfirm: () => {} });

  const valoresIniciales = (): MiembroFormValues => ({
    modo: 'crear',
    nombreCompleto: '',
    correo: '',
    contrasena: '',
    telefono: '',
    rolId: '',
    sucursalAccesoId: '',
    tipoContratacion: 'PLANILLA',
    estado: 'ACTIVO',
    costoPorHora: 0,
    comisionPorcentaje: '',
    disciplinaIds: [],
    horarioSucursalId: '',
    dias: diasVacios(),
  });

  const form = useForm<MiembroFormValues>({ resolver: zodResolver(miembroSchema), defaultValues: valoresIniciales() });

  const { data: personal, isLoading } = useQuery({
    queryKey: ['personal', activeTenantId, showDeleted],
    queryFn: async () => unwrapList<Staff>(await apiGet(showDeleted ? '/personal?deleted=true' : '/personal')),
    enabled: !!token,
  });

  const { data: roles } = useQuery({
    queryKey: ['roles', activeTenantId],
    queryFn: async () => unwrapList<Rol>(await apiGet('/roles')),
    enabled: !!token,
  });

  const { data: sucursales } = useQuery({
    queryKey: ['sucursales', activeTenantId],
    queryFn: async () => unwrapList<Sucursal>(await apiGet('/sucursales')),
    enabled: !!token,
  });

  const { data: disciplinas } = useQuery({
    queryKey: ['disciplinas', activeTenantId],
    queryFn: async () => unwrapList<Disciplina>(await apiGet('/disciplinas')),
    enabled: !!token,
  });

  const rolesAsignables = (roles || []).filter((r) => !ROLES_NO_ASIGNABLES.includes(r.nombre));
  const sucursalesList = sucursales || [];
  const nombreSucursal = (id?: string | null) => sucursalesList.find((s) => s.id === id)?.nombre;

  const describirResultado = (res: { horarioResumen?: ResumenHorario | null; usuarioExistente?: boolean }) => {
    const partes: string[] = [];
    const r = res.horarioResumen;
    if (r) {
      if (r.turnosCreados) partes.push(`${r.turnosCreados} turnos programados`);
      if (r.turnosActualizados) partes.push(`${r.turnosActualizados} actualizados`);
      if (r.turnosEliminados) partes.push(`${r.turnosEliminados} quitados`);
      if (r.turnosConservados) partes.push(`${r.turnosConservados} conservados porque tienen clases asignadas`);
    }
    let texto = partes.length ? `Horario aplicado: ${partes.join(', ')}.` : '';
    if (res.usuarioExistente) texto += ' Ese correo ya tenía una cuenta: seguirá usando su contraseña actual.';
    return texto.trim() || undefined;
  };

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['personal'] });
    queryClient.invalidateQueries({ queryKey: ['usuarios'] });
    queryClient.invalidateQueries({ queryKey: ['turnos'] });
    queryClient.invalidateQueries({ queryKey: ['turnos-plantilla'] });
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      editingPersonal
        ? apiPatch<{ horarioResumen?: ResumenHorario }>(`/personal/${editingPersonal.id}/equipo`, payload)
        : apiPost<{ horarioResumen?: ResumenHorario; usuarioExistente?: boolean }>('/personal/equipo', payload),
    onSuccess: (res) => {
      invalidar();
      setIsDialogOpen(false);
      setEditingPersonal(null);
      toast({
        title: editingPersonal ? 'Cambios guardados' : 'Persona agregada al equipo',
        description: describirResultado(res || {}),
        variant: 'success',
      });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const { deleteItem, restoreItem, isRestoring } = useSoftDelete({
    queryKey: ['personal', activeTenantId, showDeleted],
    endpoint: 'personal',
    modelName: 'perfilStaff',
    itemName: 'El perfil de staff',
  });

  const onSubmit = (values: MiembroFormValues) => {
    const diasActivos = values.dias
      .map((d, dia) => ({ ...d, dia }))
      .filter((d) => d.activo)
      .map((d) => ({ diaSemana: d.dia, horaEntrada: d.entrada, horaSalida: d.salida }));

    // En edición el horario solo se envía si se tocó (guardarlo re-sincroniza los turnos futuros).
    const horarioTocado = !!form.formState.dirtyFields.dias || !!form.formState.dirtyFields.horarioSucursalId;
    const enviarHorario = editingPersonal ? horarioTocado : diasActivos.length > 0;
    const horarioSucursalId = values.horarioSucursalId || sucursalesList[0]?.id;

    const base: Record<string, unknown> = {
      nombreCompleto: values.nombreCompleto.trim(),
      telefono: values.telefono.trim() || undefined,
      rolId: values.rolId,
      tipoContratacion: values.tipoContratacion,
      estado: values.estado,
      costoPorHora: Number(values.costoPorHora) || 0,
      comisionPorcentaje: values.comisionPorcentaje === '' ? undefined : Number(values.comisionPorcentaje),
      disciplinaIds: values.disciplinaIds,
      ...(enviarHorario && horarioSucursalId ? { horario: { sucursalId: horarioSucursalId, dias: diasActivos } } : {}),
    };

    if (editingPersonal) {
      saveMutation.mutate({ ...base, sucursalId: values.sucursalAccesoId || null });
    } else {
      saveMutation.mutate({
        ...base,
        correo: (values.correo ?? '').trim(),
        contrasena: values.contrasena,
        sucursalId: values.sucursalAccesoId || undefined,
      });
    }
  };

  const handleAddNew = () => {
    setEditingPersonal(null);
    const iniciales = valoresIniciales();
    if (sucursalesList.length === 1) iniciales.horarioSucursalId = sucursalesList[0].id;
    form.reset(iniciales);
    setIsDialogOpen(true);
  };

  const handleEdit = (staff: Staff) => {
    setEditingPersonal(staff);
    const asignacion = staff.usuario?.asignacionesAcceso?.[0];
    const dias = diasVacios();
    for (const b of staff.turnosPlantilla || []) {
      dias[b.diaSemana] = { activo: true, entrada: horaDe(b.horaEntrada), salida: horaDe(b.horaSalida) };
    }
    form.reset({
      modo: 'editar',
      nombreCompleto: staff.usuario?.nombreCompleto || '',
      correo: staff.usuario?.correo || '',
      contrasena: '',
      telefono: staff.usuario?.telefono || '',
      rolId: asignacion?.rolId || '',
      sucursalAccesoId: asignacion?.sucursalId || '',
      tipoContratacion: staff.tipoContratacion || 'PLANILLA',
      estado: staff.estado || 'ACTIVO',
      costoPorHora: Number(staff.costoPorHora) || 0,
      comisionPorcentaje: staff.comisionPorcentaje != null ? String(Number(staff.comisionPorcentaje)) : '',
      disciplinaIds: (staff.staffDisciplinas || []).map((sd) => sd.disciplinaId),
      horarioSucursalId: staff.turnosPlantilla?.[0]?.sucursalId || (sucursalesList.length === 1 ? sucursalesList[0].id : ''),
      dias,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (staff: Staff) => {
    setConfirmConfig({
      title: '¿Quitar del equipo?',
      description: `Se eliminará el perfil de staff de ${staff.usuario?.nombreCompleto}. Podrás deshacerlo en los próximos segundos.`,
      onConfirm: () => deleteItem(staff.id),
    });
    setConfirmOpen(true);
  };

  if (!token) return null;

  const filteredPersonal = (personal || []).filter((p) => {
    if (!searchTerm) return true;
    return p.usuario?.nombreCompleto?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // ------------------------------------------------------------------
  // Grilla del horario semanal (paso 3 del formulario)
  // ------------------------------------------------------------------
  const renderHorario = (f: UseFormReturn<FieldValues>) => {
    const dias = f.watch('dias') as MiembroFormValues['dias'];
    const errores = (f.formState.errors.dias as unknown as { salida?: { message?: string } }[] | undefined) || [];
    const copiarPrimerDia = () => {
      const primero = DIAS_GRILLA.map((d) => dias[d.dia]).find((d) => d.activo);
      if (!primero) return;
      DIAS_GRILLA.forEach(({ dia }) => {
        if (dias[dia].activo) {
          f.setValue(`dias.${dia}.entrada`, primero.entrada, { shouldDirty: true });
          f.setValue(`dias.${dia}.salida`, primero.salida, { shouldDirty: true });
        }
      });
    };
    const inputHora = 'h-9 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-slate-900 px-2 text-sm disabled:opacity-40';

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Días y horas de trabajo</p>
          <Button type="button" variant="ghost" size="sm" onClick={copiarPrimerDia} className="text-indigo-600 dark:text-indigo-400">
            <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar el primer horario a los días marcados
          </Button>
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
          {DIAS_GRILLA.map(({ dia, label }) => {
            const activo = dias?.[dia]?.activo;
            const error = errores[dia]?.salida?.message;
            return (
              <div key={dia} className="px-3 py-2">
                <div className="flex items-center gap-3">
                  <Controller
                    name={`dias.${dia}.activo`}
                    control={f.control}
                    render={({ field }) => (
                      <label className="flex items-center gap-2 w-32 cursor-pointer">
                        <Checkbox checked={!!field.value} onCheckedChange={(c) => field.onChange(!!c)} className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600" />
                        <span className={`text-sm font-medium ${activo ? 'text-zinc-900 dark:text-white' : 'text-zinc-400 dark:text-zinc-500'}`}>{label}</span>
                      </label>
                    )}
                  />
                  <input type="time" disabled={!activo} {...f.register(`dias.${dia}.entrada`)} className={inputHora} aria-label={`Entrada ${label}`} />
                  <span className="text-zinc-400">a</span>
                  <input type="time" disabled={!activo} {...f.register(`dias.${dia}.salida`)} className={inputHora} aria-label={`Salida ${label}`} />
                </div>
                {activo && error && <p className="text-xs text-red-500 mt-1 ml-32 pl-3">{error}</p>}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Los turnos de las próximas semanas se generan solos a partir de este horario. Para una ausencia puntual (vacaciones, día libre), marca ese turno como Ausente o Cancelado en Turnos.
        </p>
      </div>
    );
  };

  return (
    <Protect permission="staff:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Personal</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Entrenadores y personal: su acceso al sistema, disciplinas y horario semanal.</p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por nombre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 shadow-xs"
              />
            </div>

            <PapeleraToggle showDeleted={showDeleted} setShowDeleted={setShowDeleted} />

            <Protect permission="staff:crear" fallbackType="hide">
              <TenantRequiredButton onClick={handleAddNew} icon={<Plus className="mr-2 h-4 w-4" />} label="Agregar al equipo" />
            </Protect>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton columns={6} showAvatar={true} />
        ) : filteredPersonal.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title={searchTerm ? 'Nadie encontrado' : 'Todavía no hay nadie en el equipo'}
            description={searchTerm ? 'Prueba con otro nombre.' : 'Agrega a tus entrenadores y personal: se crea su cuenta de acceso, sus disciplinas y su horario en un solo paso.'}
            actionLabel="Agregar al equipo"
            actionIcon={<Plus className="w-4 h-4" />}
            onAction={handleAddNew}
            permission="staff:crear"
            isSearch={!!searchTerm}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Disciplinas</TableHead>
                <TableHead>Horario</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPersonal.map((p) => {
                const asignacion = p.usuario?.asignacionesAcceso?.[0];
                const horario = resumirHorario(p.turnosPlantilla);
                const sucursalHorario = nombreSucursal(p.turnosPlantilla?.[0]?.sucursalId);
                return (
                  <TableRow key={p.id} className={showDeleted ? 'bg-rose-50/40 dark:bg-rose-500/20 opacity-80' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-xs shrink-0">
                          {p.usuario?.nombreCompleto?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white text-sm">{p.usuario?.nombreCompleto}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{p.usuario?.correo}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{asignacion?.rol?.nombre || '—'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{TIPO_CONTRATACION_LABEL[p.tipoContratacion] || p.tipoContratacion}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(p.staffDisciplinas || []).length === 0 ? (
                          <span className="text-xs text-slate-400 dark:text-slate-500">Sin disciplinas</span>
                        ) : (
                          (p.staffDisciplinas || []).map((sd) => <Badge key={sd.disciplinaId} variant="default">{sd.disciplina?.nombre}</Badge>)
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {horario.length === 0 ? (
                        <span className="text-xs text-slate-400 dark:text-slate-500">Sin horario fijo</span>
                      ) : (
                        <div className="text-xs text-slate-700 dark:text-slate-300 space-y-0.5">
                          {horario.map((h) => <p key={h}>{h}</p>)}
                          {sucursalHorario && sucursalesList.length > 1 && <p className="text-slate-500 dark:text-slate-400">{sucursalHorario}</p>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.estado === 'ACTIVO' ? <Badge variant="success">Activo</Badge> : <Badge variant="default">Inactivo</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {showDeleted ? (
                          <Protect permission="sistema:restaurar">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => restoreItem(p.id)}
                              disabled={isRestoring}
                              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 h-8 px-3"
                            >
                              <ArchiveRestore className="h-4 w-4 mr-2" /> Restaurar
                            </Button>
                          </Protect>
                        ) : (
                          <>
                            <Protect permission="staff:actualizar" fallbackType="hide">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(p)} className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </Protect>
                            <Protect permission="staff:eliminar" fallbackType="hide">
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(p)} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </Protect>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <GlobalFormModal
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title={editingPersonal ? 'Editar persona del equipo' : 'Agregar al equipo'}
        description={editingPersonal ? 'Datos, acceso, disciplinas y horario semanal.' : 'Crea su cuenta de acceso, su perfil y su horario semanal en un solo paso.'}
        form={form as unknown as UseFormReturn<FieldValues>}
        multiStep
        maxWidthClass="sm:max-w-[640px]"
        sections={[
          {
            title: 'Datos y acceso',
            fields: [
              { name: 'nombreCompleto', label: 'Nombre completo', type: 'text', placeholder: 'Ej. Marta Rojas', colSpan: 2 },
              {
                name: 'correo',
                label: 'Correo (para iniciar sesión)',
                type: 'email',
                placeholder: 'marta@ejemplo.com',
                disabled: !!editingPersonal,
                description: editingPersonal ? 'El correo identifica la cuenta y no se puede cambiar.' : undefined,
              },
              ...(editingPersonal
                ? []
                : [{ name: 'contrasena', label: 'Contraseña inicial', type: 'password' as const, placeholder: 'Mínimo 8 caracteres' }]),
              { name: 'telefono', label: 'Teléfono (opcional)', type: 'text' },
              {
                name: 'rolId',
                label: 'Rol',
                type: 'select',
                options: rolesAsignables.map((r) => ({ value: r.id, label: r.nombre })),
                description: 'Define qué puede hacer en el sistema.',
              },
              ...(sucursalesList.length > 1
                ? [{
                    name: 'sucursalAccesoId',
                    label: 'Acceso a sucursales',
                    type: 'select' as const,
                    options: [{ value: '', label: 'Todas las sucursales' }, ...sucursalesList.map((s) => ({ value: s.id, label: `Solo ${s.nombre}` }))],
                  }]
                : []),
            ],
          },
          {
            title: 'Perfil',
            fields: [
              {
                name: 'tipoContratacion',
                label: 'Tipo de contratación',
                type: 'select',
                options: [
                  { label: 'Planilla', value: 'PLANILLA' },
                  { label: 'Independiente', value: 'INDEPENDIENTE' },
                  { label: 'Voluntario', value: 'VOLUNTARIO' },
                ],
              },
              { name: 'estado', label: 'Estado', type: 'select', options: [{ label: 'Activo', value: 'ACTIVO' }, { label: 'Inactivo', value: 'INACTIVO' }] },
              { name: 'costoPorHora', label: 'Costo por hora', type: 'number', allowDecimals: true },
              { name: 'comisionPorcentaje', label: 'Comisión % (independiente)', type: 'number', allowDecimals: true },
              {
                name: 'disciplinaIds',
                label: '',
                type: 'custom',
                colSpan: 2,
                renderCustom: (f) => (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Disciplinas que imparte</p>
                    {(disciplinas || []).length === 0 ? (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">No hay disciplinas creadas todavía.</p>
                    ) : (
                      <Controller
                        name="disciplinaIds"
                        control={f.control}
                        render={({ field }) => (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4">
                            {(disciplinas || []).map((disc) => (
                              <label key={disc.id} className="flex items-start space-x-3 cursor-pointer group">
                                <Checkbox
                                  checked={field.value?.includes(disc.id)}
                                  onCheckedChange={(checked) =>
                                    field.onChange(checked ? [...(field.value || []), disc.id] : (field.value || []).filter((v: string) => v !== disc.id))
                                  }
                                  className="mt-0.5 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                                />
                                <span className="text-sm text-zinc-700 dark:text-zinc-300 font-medium">{disc.nombre}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      />
                    )}
                  </div>
                ),
              },
            ],
          },
          {
            title: 'Horario semanal',
            fields: [
              ...(sucursalesList.length > 1
                ? [{
                    name: 'horarioSucursalId',
                    label: 'Sucursal donde trabaja',
                    type: 'select' as const,
                    colSpan: 2 as const,
                    options: sucursalesList.map((s) => ({ value: s.id, label: s.nombre })),
                  }]
                : []),
              { name: 'dias', label: '', type: 'custom', colSpan: 2, renderCustom: renderHorario },
            ],
          },
        ]}
        onSubmit={onSubmit as unknown as (v: FieldValues) => void}
        isPending={saveMutation.isPending}
        submitLabel={editingPersonal ? 'Guardar cambios' : 'Agregar al equipo'}
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
