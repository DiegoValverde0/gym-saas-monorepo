"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, apiPatch, unwrapList } from '@/lib/api-client';
import { useForm } from 'react-hook-form';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { GlobalFormModal } from '@/components/ui/global-form-modal';
import { Protect } from '@/components/ui/protect';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, Plus, Edit, Trash2, Search, ArchiveRestore } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSoftDelete } from '@/hooks/use-soft-delete';
import { PapeleraToggle } from '@/components/ui/papelera-toggle';
import { usePermissions } from '@/hooks/use-permissions';

interface DisciplinaFormValues {
  nombre: string;
  descripcion: string;
  estado: string;
}

interface Disciplina {
  id: string;
  nombre: string;
  descripcion?: string | null;
  estado: string;
}

type ModoAcceso = 'ABIERTA' | 'MIEMBROS' | 'PLANES';
interface AccesoClases { porDefecto: ModoAcceso; porDisciplina: Record<string, { modo: ModoAcceso; planIds?: string[] }> }
interface StaffConDisciplinas { id: string; usuario?: { nombreCompleto: string }; staffDisciplinas?: { disciplinaId: string }[] }
interface Serie { disciplinaId?: string | null; nombreClase: string; sucursalId: string; activa?: boolean }

// Mismos textos que el asistente "Nueva clase" (paso 4).
const QUIEN_RESERVA: Record<ModoAcceso, string> = {
  MIEMBROS: 'Cualquier cliente con membresía',
  PLANES: 'Solo ciertos planes',
  ABIERTA: 'Abierta a todos',
};

export default function DisciplinasPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token } = useAuth();
  const { activeTenantId } = useTenantStore();

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Cada disciplina muestra sus instructores, sus clases y quién puede
  // reservarla (plan 11.11). Cada dato depende de su propio permiso.
  const { hasPermission } = usePermissions();
  const { data: equipo } = useQuery({
    queryKey: ['personal', activeTenantId],
    queryFn: async () => unwrapList<StaffConDisciplinas>(await apiGet('/personal')),
    enabled: !!token && hasPermission('staff:leer'),
  });
  const { data: series } = useQuery({
    queryKey: ['clases-plantilla', 'disciplinas'],
    queryFn: async () => unwrapList<Serie>(await apiGet('/clases-plantilla?limit=100')),
    enabled: !!token && hasPermission('clases:leer'),
  });
  const { data: acceso } = useQuery({
    queryKey: ['acceso-clases'],
    queryFn: async () => apiGet<AccesoClases>('/acceso-clases'),
    enabled: !!token && hasPermission('clases:leer'),
  });
  const instructoresDe = (id: string) =>
    (equipo ?? []).filter((s) => s.staffDisciplinas?.some((sd) => sd.disciplinaId === id)).map((s) => s.usuario?.nombreCompleto?.split(' ')[0] ?? 'Sin nombre');
  const clasesDe = (id: string) =>
    new Set((series ?? []).filter((c) => c.disciplinaId === id && c.activa !== false).map((c) => `${c.nombreClase}|${c.sucursalId}`)).size;
  const reservaDe = (id: string) => {
    if (!acceso) return null;
    return QUIEN_RESERVA[(acceso.porDisciplina[id]?.modo ?? acceso.porDefecto) as ModoAcceso];
  };
  const [editingDisciplina, setEditingDisciplina] = useState<Disciplina | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    description: '',
    onConfirm: () => {},
    isDestructive: false
  });

  const form = useForm<DisciplinaFormValues>({
    defaultValues: { nombre: '', descripcion: '', estado: 'ACTIVO' },
  });

  const { data: disciplinas, isLoading } = useQuery({
    queryKey: ['disciplinas', activeTenantId, showDeleted],
    queryFn: async () => unwrapList(await apiGet(showDeleted ? '/disciplinas?deleted=true' : '/disciplinas')),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: async (values: DisciplinaFormValues) => apiPost('/disciplinas', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disciplinas'] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: 'Éxito', description: 'Disciplina creada correctamente.', variant: 'success' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: DisciplinaFormValues }) => apiPatch(`/disciplinas/${id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disciplinas'] });
      setIsDialogOpen(false);
      setEditingDisciplina(null);
      form.reset();
      toast({ title: 'Éxito', description: 'Disciplina actualizada correctamente.', variant: 'success' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const { deleteItem, restoreItem, isRestoring } = useSoftDelete({
    queryKey: ['disciplinas', showDeleted],
    endpoint: 'disciplinas',
    modelName: 'disciplina',
    itemName: 'La disciplina'
  });

  const onSubmit = (values: DisciplinaFormValues) => {
    if (editingDisciplina) {
      updateMutation.mutate({ id: editingDisciplina.id, values });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleAddNew = () => {
    setEditingDisciplina(null);
    form.reset({ nombre: '', descripcion: '', estado: 'ACTIVO' });
    setIsDialogOpen(true);
  };

  const handleEdit = (disciplina: Disciplina) => {
    setEditingDisciplina(disciplina);
    form.reset({
      nombre: disciplina.nombre,
      descripcion: disciplina.descripcion || '',
      estado: disciplina.estado || 'ACTIVO',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (disciplina: Disciplina) => {
    setConfirmConfig({
      title: '¿Eliminar Disciplina?',
      description: `Estás a punto de eliminar "${disciplina.nombre}". Esta acción no se puede deshacer.`,
      isDestructive: true,
      onConfirm: () => deleteItem(disciplina.id),
    });
    setConfirmOpen(true);
  };

  if (!token) return null;

  const filteredDisciplinas = (unwrapList(disciplinas) as Disciplina[]).filter((d: Disciplina) => {
    if (!searchTerm) return true;
    return d.nombre?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <Protect permission="disciplinas:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Disciplinas</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Catálogo de especialidades que se imparten en el gimnasio.</p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Buscar disciplina..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 shadow-xs"
              />
            </div>
            
            <PapeleraToggle showDeleted={showDeleted} setShowDeleted={setShowDeleted} />

            <Protect permission="disciplinas:crear" fallbackType="hide">
              <TenantRequiredButton
                onClick={handleAddNew}
                icon={<Plus className="mr-2 h-4 w-4" />}
                label="Nueva Disciplina"
              />
            </Protect>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton columns={4} />
        ) : filteredDisciplinas.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={searchTerm ? 'Ninguna disciplina encontrada' : 'No hay disciplinas registradas'}
            description={searchTerm ? 'Prueba con otro nombre.' : 'Crea la primera disciplina para poder asignarla a tu personal y estructurar tus clases.'}
            actionLabel="Nueva Disciplina"
            actionIcon={<Plus className="w-4 h-4" />}
            onAction={handleAddNew}
            permission="disciplinas:crear"
            isSearch={!!searchTerm}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Disciplina</TableHead>
                <TableHead>Instructores</TableHead>
                <TableHead>Clases</TableHead>
                <TableHead>Quién reserva</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDisciplinas.map((d: Disciplina) => (
                <TableRow key={d.id} className={showDeleted ? "bg-rose-50/40 dark:bg-rose-500/20 opacity-80" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-700 dark:text-indigo-300 shrink-0">
                        <ClipboardList className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">{d.nombre}</p>
                        {d.descripcion && <p className="text-xs text-slate-500 dark:text-slate-400">{d.descripcion}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      {equipo ? (instructoresDe(d.id).join(', ') || 'Nadie la imparte todavía') : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      {series ? (clasesDe(d.id) ? `${clasesDe(d.id)} ${clasesDe(d.id) === 1 ? 'clase' : 'clases'}` : 'Sin clases') : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600 dark:text-slate-400">{reservaDe(d.id) ?? '—'}</span>
                  </TableCell>
                  <TableCell>
                    {d.estado === 'ACTIVO' ? <Badge variant="success">Activo</Badge> : <Badge variant="default">Inactivo</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {showDeleted ? (
                        <Protect permission="sistema:restaurar">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => restoreItem(d.id)} 
                            disabled={isRestoring}
                            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 h-8 px-3"
                          >
                            <ArchiveRestore className="h-4 w-4 mr-2" /> Restaurar
                          </Button>
                        </Protect>
                      ) : (
                        <>
                          <Protect permission="disciplinas:actualizar" fallbackType="hide">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(d)} className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </Protect>
                          <Protect permission="disciplinas:eliminar" fallbackType="hide">
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(d)} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400">
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
        title={editingDisciplina ? 'Editar Disciplina' : 'Nueva Disciplina'}
        description={editingDisciplina ? 'Modifica los datos de la disciplina.' : 'Agrega una nueva especialidad al catálogo.'}
        form={form as any}
        sections={[
          {
            fields: [
              { name: 'nombre', label: 'Nombre', type: 'text', placeholder: 'Ej. Yoga, CrossFit, Spinning', colSpan: 2 },
              { name: 'descripcion', label: 'Descripción (Opcional)', type: 'text', colSpan: 2 },
              { name: 'estado', label: 'Estado', type: 'select', options: [{ label: 'Activo', value: 'ACTIVO' }, { label: 'Inactivo', value: 'INACTIVO' }], colSpan: 2 },
            ],
          },
        ]}
        onSubmit={onSubmit as any}
        isPending={createMutation.isPending || updateMutation.isPending}
        submitLabel="Guardar Disciplina"
      />

      <GlobalConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        onConfirm={confirmConfig.onConfirm}
        isDestructive={confirmConfig.isDestructive}
      />
    </Protect>
  );
}
