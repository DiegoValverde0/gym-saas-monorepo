"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, apiPut, unwrapList } from '@/lib/api-client';
import { useForm, Controller } from 'react-hook-form';
import { useSoftDelete } from '@/hooks/use-soft-delete';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { GlobalFormModal } from '@/components/ui/global-form-modal';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Protect } from '@/components/ui/protect';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Checkbox } from '@/components/ui/checkbox';
import { Shield, Plus, Edit, Trash2, ShieldCheck, CheckCircle2, Search, ArchiveRestore } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PapeleraToggle } from '@/components/ui/papelera-toggle';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const rolSchema = z.object({
  nombre: z.string().min(3, "El nombre es obligatorio"),
  descripcion: z.string().optional(),
  permisosIds: z.array(z.string()).min(1, "Selecciona al menos 1 permiso"),
});

type RolFormValues = z.infer<typeof rolSchema>;

export default function RolesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token, isSuperAdmin } = useAuth();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingRol, setEditingRol] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const { activeTenantId } = useTenantStore();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    description: '',
    onConfirm: () => {},
    isDestructive: false
  });

  const form = useForm<RolFormValues>({
    resolver: zodResolver(rolSchema),
    mode: 'onChange',
    defaultValues: {
      nombre: '',
      descripcion: '',
      permisosIds: [],
    },
  });

  const { data: roles, isLoading: loadingRoles } = useQuery({
    queryKey: ['roles', activeTenantId, showDeleted],
    queryFn: async () => unwrapList(await apiGet(showDeleted ? '/roles?deleted=true' : '/roles')),
    enabled: !!token,
  });

  const { data: permisosCatalogo, isLoading: loadingPermisos } = useQuery({
    queryKey: ['permisos', activeTenantId],
    queryFn: async () => {
      const catalogo = unwrapList<any>(await apiGet('/permisos'));
      // El módulo 'organizaciones' nunca es asignable a un rol (ver
      // rol.service.ts#assertPermisosAsignables) -- ni mostrarlo evita un
      // 400 confuso si alguien lo marca y guarda.
      return catalogo.filter((p) => p.modulo !== 'organizaciones');
    },
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: async (values: RolFormValues) => apiPost('/roles', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setIsSheetOpen(false);
      form.reset();
      toast({ title: 'Éxito', description: 'Rol creado correctamente.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string, values: RolFormValues }) => apiPut(`/roles/${data.id}`, data.values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setIsSheetOpen(false);
      setEditingRol(null);
      form.reset();
      toast({ title: 'Éxito', description: 'Rol actualizado correctamente.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const { deleteItem, restoreItem, isRestoring } = useSoftDelete({
    queryKey: ['roles', showDeleted],
    endpoint: 'roles',
    modelName: 'rol',
    itemName: 'El rol'
  });

  const onSubmit = (values: RolFormValues) => {
    if (editingRol) {
      updateMutation.mutate({ id: editingRol.id, values });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleEdit = (rol: any) => {
    setEditingRol(rol);
    form.reset({
      nombre: rol.nombre,
      descripcion: rol.descripcion || '',
      permisosIds: rol.rolPermisos.map((rp: any) => rp.permisoId),
    });
    setIsSheetOpen(true);
  };

  const handleAddNew = () => {
    setEditingRol(null);
    form.reset({ nombre: '', descripcion: '', permisosIds: [] });
    setIsSheetOpen(true);
  };

  const handleDelete = (id: string) => {
    setConfirmConfig({
      title: '¿Eliminar Rol?',
      description: 'Esta acción no se puede deshacer. Los usuarios con este rol perderán sus accesos asociados.',
      isDestructive: true,
      onConfirm: () => deleteItem(id),
    });
    setConfirmOpen(true);
  };

  if (!token) return null;

  const filteredRoles = (roles || []).filter((rol: any) => {
    if (!searchTerm) return true;
    const lower = searchTerm.toLowerCase();
    return rol.nombre?.toLowerCase().includes(lower) || rol.descripcion?.toLowerCase().includes(lower);
  });

  // Agrupamos los permisos por módulo para la UI
  const permisosAgrupados = permisosCatalogo?.reduce((acc: any, permiso: any) => {
    if (!acc[permiso.modulo]) {
      acc[permiso.modulo] = [];
    }
    acc[permiso.modulo].push(permiso);
    return acc;
  }, {});

  return (
    <Protect permission="roles:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Roles y Permisos</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Configura el nivel de acceso de tu personal (RBAC).</p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Buscar rol..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 shadow-xs"
              />
            </div>
            
            <PapeleraToggle showDeleted={showDeleted} setShowDeleted={setShowDeleted} />

            <Protect permission="roles:crear">
              <TenantRequiredButton
                onClick={handleAddNew}
                icon={<Plus className="mr-2 h-4 w-4" />}
                label="Nuevo Rol"
              />
            </Protect>
          </div>
          <GlobalFormModal
            open={isSheetOpen}
            onOpenChange={setIsSheetOpen}
            title={editingRol ? 'Editar Rol' : 'Nuevo Rol'}
            description="Asigna un nombre al rol y selecciona los permisos exactos que tendrá en el sistema."
            form={form as any}
            maxWidthClass="sm:max-w-xl"
            sections={[
              {
                fields: [
                  { name: 'nombre', label: 'Nombre del Rol', type: 'text', placeholder: 'Ej. Gerente de Ventas', disabled: editingRol?.esSistema },
                  { name: 'descripcion', label: 'Descripción', type: 'text', placeholder: 'Puede ver reportes y ventas' }
                ]
              },
              {
                title: 'Permisos del Sistema',
                description: 'Selecciona los módulos a los que este rol tendrá acceso.',
                fields: [
                  {
                    name: 'permisosIds',
                    label: '',
                    type: 'custom',
                    colSpan: 2,
                    renderCustom: (formContext) => (
                      <div>
                        {formContext.formState.errors.permisosIds && <p className="text-sm text-red-500 dark:text-red-400 mb-2">{formContext.formState.errors.permisosIds.message as string}</p>}
                        {loadingPermisos ? (
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando catálogo de permisos...</p>
                        ) : (
                          <div className="space-y-4">
                            <Controller
                              name="permisosIds"
                              control={formContext.control}
                              render={({ field }) => (
                                <>
                                  <div className="flex justify-end">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        const allIds = (permisosCatalogo || []).map((p: any) => p.id);
                                        const areAllSelected = allIds.every((id: string) => field.value?.includes(id));
                                        if (areAllSelected) {
                                          field.onChange([]);
                                        } else {
                                          field.onChange(allIds);
                                        }
                                      }}
                                    >
                                      {(permisosCatalogo || []).every((p: any) => field.value?.includes(p.id)) ? 'Desmarcar Todos' : 'Seleccionar Todos'}
                                    </Button>
                                  </div>
                                  {permisosAgrupados && Object.keys(permisosAgrupados).map((modulo) => (
                                  <div key={modulo} className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all hover:border-indigo-100 dark:hover:border-indigo-900/50">
                                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-zinc-100 dark:border-zinc-800">
                                      <h4 className="font-semibold text-zinc-900 dark:text-white capitalize">{modulo}</h4>
                                      <button
                                        type="button"
                                        className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:text-indigo-800 dark:hover:text-indigo-200 transition-colors"
                                        onClick={() => {
                                          const moduleIds = permisosAgrupados[modulo].map((p: any) => p.id);
                                          const areAllSelected = moduleIds.every((id: string) => field.value?.includes(id));
                                          
                                          if (areAllSelected) {
                                            const newValue = field.value?.filter((id: string) => !moduleIds.includes(id)) || [];
                                            field.onChange(newValue);
                                          } else {
                                            const newValue = Array.from(new Set([...(field.value || []), ...moduleIds]));
                                            field.onChange(newValue);
                                          }
                                        }}
                                      >
                                        {permisosAgrupados[modulo].every((p: any) => field.value?.includes(p.id)) ? 'Desmarcar sección' : 'Seleccionar sección'}
                                      </button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4">
                                      {permisosAgrupados[modulo].map((permiso: any) => (
                                        <label key={permiso.id} className="flex items-start space-x-3 cursor-pointer group">
                                          <Checkbox
                                            checked={field.value?.includes(permiso.id)}
                                            onCheckedChange={(checked) => {
                                              const newValue = checked
                                                ? [...(field.value || []), permiso.id]
                                                : field.value?.filter((val: string) => val !== permiso.id) || [];
                                              field.onChange(newValue);
                                            }}
                                            className="mt-0.5 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                                          />
                                          <span className="text-sm text-zinc-700 dark:text-zinc-300 capitalize font-medium group-hover:text-indigo-900 dark:group-hover:text-indigo-100 transition-colors">
                                            {permiso.accion}
                                          </span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                                </>
                              )}
                            />
                          </div>
                        )}
                      </div>
                    )
                  }
                ]
              }
            ]}
            onSubmit={onSubmit as any}
            isPending={createMutation.isPending || updateMutation.isPending}
            submitLabel="Guardar Rol"
          />
        </div>

        {loadingRoles ? (
          <TableSkeleton columns={4} />
        ) : filteredRoles.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={searchTerm ? 'Ningún rol encontrado' : 'No hay roles configurados'}
            description={searchTerm ? 'Prueba con otro nombre.' : 'Crea tu primer rol personalizado. Podrás asignar permisos específicos a tu personal.'}
            actionLabel="Nuevo Rol"
            actionIcon={<Plus className="w-4 h-4" />}
            onAction={handleAddNew}
            permission="roles:crear"
            isSearch={!!searchTerm}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre del Rol</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Permisos Asignados</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRoles.map((rol: any) => (
                <TableRow key={rol.id} className={showDeleted ? "bg-rose-50/40 dark:bg-rose-500/20 opacity-80" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-700 dark:text-indigo-300 shrink-0">
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">{rol.nombre}</p>
                        {!rol.organizacionId && (
                          <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">Global · todas las organizaciones</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{rol.descripcion || '-'}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="default">{rol.rolPermisos?.length || 0} permisos</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!rol.esSistema && (
                        showDeleted ? (
                          <Protect permission="sistema:restaurar">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => restoreItem(rol.id)} 
                              disabled={isRestoring}
                              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 h-8 px-3"
                            >
                              <ArchiveRestore className="h-4 w-4 mr-2" /> Restaurar
                            </Button>
                          </Protect>
                        ) : (
                          <>
                            <Protect permission="roles:actualizar" fallbackType="hide">
                              {(() => {
                                const isGlobalRole = !rol.organizacionId;
                                const canEditRow = isSuperAdmin ? isGlobalRole : !isGlobalRole;
                                const reason = !canEditRow
                                  ? (isGlobalRole
                                      ? 'Los roles globales del sistema solo los edita el superadmin'
                                      : 'El superadmin no puede editar roles de una organización específica')
                                  : undefined;
                                return (
                                  <Button variant="ghost" size="icon" onClick={() => handleEdit(rol)} disabled={!canEditRow} title={reason} className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                );
                              })()}
                            </Protect>
                            <Protect permission="roles:eliminar" fallbackType="hide">
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(rol.id)} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </Protect>
                          </>
                        )
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <GlobalConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={confirmConfig.title}
          description={confirmConfig.description}
          onConfirm={confirmConfig.onConfirm}
          isDestructive={confirmConfig.isDestructive}
        />
      </div>
    </Protect>
  );
}
