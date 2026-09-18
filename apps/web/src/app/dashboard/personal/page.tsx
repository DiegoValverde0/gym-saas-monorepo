"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, apiPatch, unwrapList } from '@/lib/api-client';
import { useForm, Controller } from 'react-hook-form';
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
import { UserCog, Plus, Edit, Trash2, Search, ArchiveRestore } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PapeleraToggle } from '@/components/ui/papelera-toggle';
import { Label } from '@/components/ui/label';

const TIPO_CONTRATACION_LABEL: Record<string, string> = {
  PLANILLA: 'Planilla',
  INDEPENDIENTE: 'Independiente',
  VOLUNTARIO: 'Voluntario',
};

interface Usuario {
  id: string;
  nombreCompleto: string;
  correo: string;
  isSuperAdmin?: boolean;
}

interface Asignacion {
  usuario: Usuario;
}

interface Disciplina {
  id: string;
  nombre: string;
}

interface StaffDisciplina {
  disciplinaId: string;
  disciplina?: Disciplina;
}

interface Staff {
  id: string;
  usuarioId: string;
  tipoContratacion: string;
  costoPorHora: number | string;
  comisionPorcentaje?: number | string | null;
  estado: string;
  usuario?: Usuario;
  staffDisciplinas?: StaffDisciplina[];
}

interface StaffFormValues {
  usuarioId: string;
  tipoContratacion: string;
  costoPorHora: number;
  comisionPorcentaje: string;
  estado: string;
  disciplinaIds: string[];
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

  const form = useForm<StaffFormValues>({
    defaultValues: {
      usuarioId: '',
      tipoContratacion: 'PLANILLA',
      costoPorHora: 0,
      comisionPorcentaje: '',
      estado: 'ACTIVO',
      disciplinaIds: [] as string[],
    },
  });

  const { data: personal, isLoading } = useQuery({
    queryKey: ['personal', activeTenantId, showDeleted],
    queryFn: async () => unwrapList(await apiGet(showDeleted ? '/personal?deleted=true' : '/personal')),
    enabled: !!token,
  });

  const { data: asignaciones } = useQuery({
    queryKey: ['usuarios', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/usuario')),
    enabled: !!token,
  });

  const { data: disciplinas } = useQuery({
    queryKey: ['disciplinas', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/disciplinas')),
    enabled: !!token,
  });

  const personalList = unwrapList(personal);
  // Usuarios de la organización que todavía no tienen perfil de staff. Se
  // excluye al superadmin: su asignación es global (organizacionId null) y
  // el propio backend la rechaza igual, pero no debe ni aparecer como opción.
  const usuariosDisponibles = (unwrapList(asignaciones) as Asignacion[])
    .map((a: Asignacion) => a.usuario)
    .filter((u: Usuario) => u && !u.isSuperAdmin && !(personalList as any[]).some((p: Staff) => p.usuarioId === u.id));

  const createMutation = useMutation({
    mutationFn: async (values: StaffFormValues) => apiPost('/personal', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal'] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: 'Éxito', description: 'Perfil de staff creado correctamente.', variant: 'success' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<StaffFormValues> }) => apiPatch(`/personal/${id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal'] });
      setIsDialogOpen(false);
      setEditingPersonal(null);
      form.reset();
      toast({ title: 'Éxito', description: 'Perfil de staff actualizado correctamente.', variant: 'success' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const { deleteItem, restoreItem, isRestoring } = useSoftDelete({
    queryKey: ['personal', activeTenantId, showDeleted],
    endpoint: 'personal',
    modelName: 'perfilStaff',
    itemName: 'El perfil de staff',
  });

  const onSubmit = (values: StaffFormValues) => {
    const payload = {
      ...values,
      costoPorHora: Number(values.costoPorHora) || 0,
      comisionPorcentaje: values.comisionPorcentaje === '' ? undefined : Number(values.comisionPorcentaje),
    };
    if (editingPersonal) {
      updateMutation.mutate({ id: editingPersonal.id, values: payload as any });
    } else {
      createMutation.mutate(payload as any);
    }
  };

  const handleAddNew = () => {
    setEditingPersonal(null);
    form.reset({
      usuarioId: '',
      tipoContratacion: 'PLANILLA',
      costoPorHora: 0,
      comisionPorcentaje: '',
      estado: 'ACTIVO',
      disciplinaIds: [],
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (staff: Staff) => {
    setEditingPersonal(staff);
    form.reset({
      usuarioId: staff.usuarioId,
      tipoContratacion: staff.tipoContratacion || 'PLANILLA',
      costoPorHora: Number(staff.costoPorHora) || 0,
      comisionPorcentaje: staff.comisionPorcentaje != null ? String(Number(staff.comisionPorcentaje)) : '',
      estado: staff.estado || 'ACTIVO',
      disciplinaIds: (staff.staffDisciplinas || []).map((sd: StaffDisciplina) => sd.disciplinaId),
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (staff: Staff) => {
    setConfirmConfig({
      title: '¿Eliminar perfil de staff?',
      description: `Estás a punto de eliminar el perfil de ${staff.usuario?.nombreCompleto}. Podrás deshacerlo en los próximos segundos.`,
      onConfirm: () => deleteItem(staff.id),
    });
    setConfirmOpen(true);
  };

  if (!token) return null;

  const filteredPersonal = (personalList as Staff[]).filter((p: Staff) => {
    if (!searchTerm) return true;
    return p.usuario?.nombreCompleto?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <Protect permission="staff:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Personal</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Perfiles de staff (entrenadores y personal operativo) y sus disciplinas.</p>
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
              <TenantRequiredButton
                onClick={handleAddNew}
                icon={<Plus className="mr-2 h-4 w-4" />}
                label="Nuevo Perfil"
              />
            </Protect>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton columns={5} showAvatar={true} />
        ) : filteredPersonal.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title={searchTerm ? 'Ningún personal encontrado' : 'No hay personal registrado'}
            description={searchTerm ? 'Prueba con otro nombre.' : 'Crea perfiles de staff para poder asignarles disciplinas, clases y turnos.'}
            actionLabel="Nuevo Perfil"
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
                <TableHead>Contratación</TableHead>
                <TableHead>Disciplinas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPersonal.map((p: Staff) => (
                <TableRow key={p.id} className={showDeleted ? "bg-rose-50/40 dark:bg-rose-500/20 opacity-80" : ""}>
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
                    <span className="text-xs text-slate-600 dark:text-slate-400">{TIPO_CONTRATACION_LABEL[p.tipoContratacion] || p.tipoContratacion}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(p.staffDisciplinas || []).length === 0
                        ? <span className="text-xs text-slate-400 dark:text-slate-500">Sin disciplinas</span>
                        : (p.staffDisciplinas || []).map((sd: StaffDisciplina) => (
                            <Badge key={sd.disciplinaId} variant="default">{sd.disciplina?.nombre}</Badge>
                          ))}
                    </div>
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
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <GlobalFormModal
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title={editingPersonal ? 'Editar Perfil de Staff' : 'Nuevo Perfil de Staff'}
        description={editingPersonal ? 'Ajusta la contratación y disciplinas de este staff.' : 'Convierte a un usuario ya registrado en personal del gimnasio.'}
        form={form as any}
        sections={[
          {
            fields: editingPersonal
              ? [
                  {
                    name: 'usuarioLabel',
                    label: 'Usuario',
                    type: 'custom',
                    colSpan: 2,
                    renderCustom: () => (
                      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-2">
                        <p className="text-sm font-medium text-zinc-900 dark:text-white">{editingPersonal?.usuario?.nombreCompleto}</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{editingPersonal?.usuario?.correo}</p>
                      </div>
                    ),
                  },
                ]
              : [
                  {
                    name: 'usuarioId',
                    label: 'Usuario',
                    type: 'select',
                    colSpan: 2,
                    options: usuariosDisponibles.map((u: Usuario) => ({ value: u.id, label: `${u.nombreCompleto} (${u.correo})` })),
                    description: usuariosDisponibles.length === 0 ? 'No hay usuarios sin perfil de staff. Regístralos primero en Administración > Usuarios.' : undefined,
                  },
                ],
          },
          {
            fields: [
              {
                name: 'tipoContratacion',
                label: 'Tipo de Contratación',
                type: 'select',
                options: [
                  { label: 'Planilla', value: 'PLANILLA' },
                  { label: 'Independiente', value: 'INDEPENDIENTE' },
                  { label: 'Voluntario', value: 'VOLUNTARIO' },
                ],
              },
              { name: 'estado', label: 'Estado', type: 'select', options: [{ label: 'Activo', value: 'ACTIVO' }, { label: 'Inactivo', value: 'INACTIVO' }] },
              { name: 'costoPorHora', label: 'Costo por Hora', type: 'number', allowDecimals: true },
              { name: 'comisionPorcentaje', label: 'Comisión % (Independiente)', type: 'number', allowDecimals: true },
            ],
          },
          {
            title: 'Disciplinas que Imparte',
            fields: [
              {
                name: 'disciplinaIds',
                label: '',
                type: 'custom',
                colSpan: 2,
                renderCustom: (formContext) => (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4">
                    {unwrapList(disciplinas).length === 0 ? (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 col-span-2">No hay disciplinas creadas todavía.</p>
                    ) : (
                      <Controller
                        name="disciplinaIds"
                        control={formContext.control}
                        render={({ field }) => (
                          <>
                            {(unwrapList(disciplinas) as any[]).map((disc: Disciplina) => (
                              <label key={disc.id} className="flex items-start space-x-3 cursor-pointer group">
                                <Checkbox
                                  checked={field.value?.includes(disc.id)}
                                  onCheckedChange={(checked) => {
                                    const newValue = checked
                                      ? [...(field.value || []), disc.id]
                                      : (field.value || []).filter((val: string) => val !== disc.id);
                                    field.onChange(newValue);
                                  }}
                                  className="mt-0.5 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                                />
                                <span className="text-sm text-zinc-700 dark:text-zinc-300 font-medium group-hover:text-indigo-900 dark:group-hover:text-indigo-100 transition-colors">
                                  {disc.nombre}
                                </span>
                              </label>
                            ))}
                          </>
                        )}
                      />
                    )}
                  </div>
                ),
              },
            ],
          },
        ]}
        onSubmit={onSubmit as any}
        isPending={createMutation.isPending || updateMutation.isPending}
        submitLabel="Guardar Perfil"
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
