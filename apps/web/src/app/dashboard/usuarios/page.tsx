"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, apiPut, apiDelete, unwrapList } from '@/lib/api-client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { GlobalFormModal } from '@/components/ui/global-form-modal';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { Protect } from '@/components/ui/protect';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Users, Plus, Edit, Trash2, ShieldCheck, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const usuarioSchema = z.object({
  nombreCompleto: z.string().min(3, "El nombre es obligatorio"),
  correo: z.string().email("Correo inválido"),
  telefono: z.string().optional(),
  contrasena: z.string().min(6, "Debe tener al menos 6 caracteres").optional().or(z.literal('')),
  rolId: z.string().min(1, "Debes seleccionar un rol"),
  sucursalId: z.string().optional(),
});

type UsuarioFormValues = z.infer<typeof usuarioSchema>;

export default function UsuariosPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingAsignacion, setEditingAsignacion] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { activeTenantId } = useTenantStore();

  const userOrgId = user?.organizacionId;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    description: '',
    onConfirm: () => {},
    isDestructive: false
  });

  const form = useForm<UsuarioFormValues>({
    resolver: zodResolver(usuarioSchema),
    mode: 'onChange',
    defaultValues: {
      nombreCompleto: '',
      correo: '',
      telefono: '',
      contrasena: '',
      rolId: '',
      sucursalId: 'global', // 'global' will be sent as null/undefined
    },
  });

  const { data: asignaciones, isLoading: loadingUsuarios } = useQuery({
    queryKey: ['usuarios', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/usuario')),
    enabled: !!token,
  });

  const { data: roles } = useQuery({
    queryKey: ['roles', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/roles')),
    enabled: !!token,
  });

  const { data: sucursales } = useQuery({
    queryKey: ['sucursales', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/sucursales')),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: async (values: UsuarioFormValues) => {
      const payload = {
          ...values,
          sucursalId: values.sucursalId === 'global' ? null : values.sucursalId
      };

      return apiPost('/usuario/empleado', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setIsSheetOpen(false);
      form.reset();
      toast({ title: 'Éxito', description: 'Empleado registrado correctamente.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string, values: UsuarioFormValues }) => {
      const payload = {
          rolId: data.values.rolId,
          sucursalId: data.values.sucursalId === 'global' ? null : data.values.sucursalId
      };

      return apiPut(`/usuario/asignacion/${data.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setIsSheetOpen(false);
      setEditingAsignacion(null);
      form.reset();
      toast({ title: 'Éxito', description: 'Accesos actualizados correctamente. (Instantáneo gracias a Redis)', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiDelete(`/usuario/asignacion/${id}`);
      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      toast({ 
        title: 'Acceso Revocado', 
        description: 'El empleado ya no tiene acceso a esta organización.', 
        variant: 'success'
      });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const onSubmit = (values: UsuarioFormValues) => {
    if (editingAsignacion) {
      updateMutation.mutate({ id: editingAsignacion.id, values });
    } else {
      if (!values.contrasena) {
         toast({ title: 'Error', description: 'La contraseña es obligatoria para un nuevo usuario.', variant: 'destructive' });
         return;
      }
      createMutation.mutate(values);
    }
  };

  const handleEdit = (asign: any) => {
    setEditingAsignacion(asign);
    form.reset({
      nombreCompleto: asign.usuario.nombreCompleto,
      correo: asign.usuario.correo,
      telefono: asign.usuario.telefono || '',
      contrasena: '', // No se puede editar la contraseña por aquí de momento (se asume global)
      rolId: asign.rolId,
      sucursalId: asign.sucursalId || 'global',
    });
    setIsSheetOpen(true);
  };

  const handleAddNew = () => {
    if (!userOrgId && (!activeTenantId || activeTenantId === 'all')) {
      toast({ title: 'Acción requerida', description: 'Por favor, selecciona una organización específica en el menú superior antes de registrar un empleado.', variant: 'destructive' });
      return;
    }
    setEditingAsignacion(null);
    form.reset({ nombreCompleto: '', correo: '', telefono: '', contrasena: '', rolId: '', sucursalId: 'global' });
    setIsSheetOpen(true);
  };

  const handleDelete = (id: string) => {
    setConfirmConfig({
      title: '¿Revocar acceso?',
      description: 'El usuario perderá acceso inmediato a esta organización. Su cuenta global seguirá existiendo.',
      isDestructive: true,
      onConfirm: () => deleteMutation.mutate(id),
    });
    setConfirmOpen(true);
  };

  if (!token) return null;

  const filteredAsignaciones = (asignaciones || []).filter((asign: any) => {
    if (!searchTerm) return true;
    const lower = searchTerm.toLowerCase();
    return (
      asign.usuario?.nombreCompleto?.toLowerCase().includes(lower) ||
      asign.usuario?.correo?.toLowerCase().includes(lower) ||
      asign.rol?.nombre?.toLowerCase().includes(lower)
    );
  });

  return (
    <Protect permission="usuarios:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Usuarios</h2>
            <p className="text-sm text-slate-500 mt-1">Gestiona los empleados y sus niveles de acceso (RBAC).</p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar empleado..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-xs"
              />
            </div>
            <Protect permission="usuarios:crear">
              <TenantRequiredButton
                onClick={handleAddNew}
                icon={<Plus className="mr-2 h-4 w-4" />}
                label="Registrar Empleado"
              />
            </Protect>
          </div>
          <GlobalFormModal
            open={isSheetOpen}
            onOpenChange={setIsSheetOpen}
            title={editingAsignacion ? 'Modificar Accesos del Empleado' : 'Registrar Nuevo Empleado'}
            description={editingAsignacion 
              ? 'Actualiza el rol y la sucursal de este usuario.' 
              : 'Crea una cuenta global para el empleado y asígnale un rol en tu organización.'}
            form={form}
            maxWidthClass="sm:max-w-xl"
            sections={[
              {
                title: 'Datos de Identidad (Global)',
                icon: <Users className="w-4 h-4 text-indigo-600" />,
                fields: [
                  { name: 'nombreCompleto', label: 'Nombre Completo', type: 'text', placeholder: 'Ej. Juan Pérez', disabled: !!editingAsignacion, colSpan: 2 },
                  { name: 'correo', label: 'Correo Electrónico', type: 'email', placeholder: 'juan@gym.com', disabled: !!editingAsignacion },
                  { name: 'telefono', label: 'Teléfono', type: 'text', placeholder: 'Ej. 12345678', disabled: !!editingAsignacion },
                  // Mostrar la contraseña solo si no estamos editando
                  ...(!editingAsignacion ? [{
                    name: 'contrasena',
                    label: 'Contraseña Inicial',
                    type: 'password' as const,
                    placeholder: '******',
                    description: 'El empleado podrá cambiarla después.',
                    colSpan: 2 as const,
                  }] : [])
                ]
              },
              {
                title: 'Asignación de Acceso (Tenant)',
                icon: <ShieldCheck className="w-4 h-4 text-indigo-600" />,
                fields: [
                  { 
                    name: 'rolId', 
                    label: 'Rol en la Organización', 
                    type: 'select', 
                    placeholder: 'Selecciona el rol',
                    options: roles?.map((r: any) => ({ label: r.nombre, value: r.id })) || [],
                    colSpan: 2
                  },
                  {
                    name: 'sucursalId',
                    label: 'Restricción por Sucursal',
                    type: 'select',
                    placeholder: 'Acceso Global (Todas las sucursales)',
                    options: [
                      { label: 'Acceso Global (Todas)', value: 'global', className: 'font-semibold text-indigo-600' },
                      ...(sucursales?.map((s: any) => ({ label: s.nombre, value: s.id })) || [])
                    ],
                    description: 'Si seleccionas una sucursal, el usuario solo podrá ver información (clientes, ventas) de dicha sede.',
                    colSpan: 2
                  }
                ]
              }
            ]}
            onSubmit={onSubmit}
            isPending={createMutation.isPending || updateMutation.isPending}
            submitLabel="Guardar Empleado"
          />
        </div>

        {loadingUsuarios ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-8 flex justify-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-8 w-8 bg-slate-200 rounded-full"></div>
              <div className="h-4 w-32 bg-slate-200 rounded"></div>
            </div>
          </div>
        ) : filteredAsignaciones.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
              <Users className="w-6 h-6" />
            </div>
            <p className="text-base font-semibold text-slate-900">
              {searchTerm ? 'Ningún empleado coincide con la búsqueda' : 'No hay personal registrado'}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              {searchTerm ? 'Prueba con otro nombre, correo o rol.' : 'Registra a tu primer empleado en esta organización.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead>Rol (Permisos)</TableHead>
                <TableHead>Restricción de Sucursal</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAsignaciones.map((asign: any) => (
                <TableRow key={asign.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs shrink-0">
                        {asign.usuario?.nombreCompleto?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{asign.usuario?.nombreCompleto}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{asign.usuario?.correo}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="primary">
                      <ShieldCheck className="w-3 h-3 mr-1" />
                      {asign.rol?.nombre}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {asign.sucursal ? (
                      <span className="text-xs text-slate-600">{asign.sucursal.nombre}</span>
                    ) : (
                      <span className="text-xs text-emerald-600 font-semibold">Global (Todas)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Protect permission="usuarios:actualizar">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(asign)} className="text-slate-500 hover:text-indigo-600">
                          <Edit className="h-4 w-4 mr-1.5" /> Permisos
                        </Button>
                      </Protect>
                      <Protect permission="usuarios:eliminar">
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(asign.id)} className="text-slate-500 hover:text-rose-600">
                          <Trash2 className="h-4 w-4 mr-1.5" /> Revocar
                        </Button>
                      </Protect>
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
