"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, apiPut, unwrapList } from '@/lib/api-client';
import { useForm } from 'react-hook-form';
import { useSoftDelete } from '@/hooks/use-soft-delete';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { GlobalFormModal } from '@/components/ui/global-form-modal';
import { Protect } from '@/components/ui/protect';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Building2, Plus, Edit, Trash2, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const sucursalSchema = z.object({
  nombre: z.string({ message: "El nombre es obligatorio" }).min(3, "El nombre es obligatorio"),
  direccion: z.string().optional(),
  telefono: z.string().optional(),
  esPrincipal: z.boolean().optional(),
  estado: z.string().optional(),
});

type SucursalFormValues = z.infer<typeof sucursalSchema>;

export default function SucursalesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSucursal, setEditingSucursal] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { activeTenantId } = useTenantStore();

  // Modal de confirmación global
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    description: '',
    onConfirm: () => {},
    isDestructive: false
  });

  const form = useForm<SucursalFormValues>({
    resolver: zodResolver(sucursalSchema),
    mode: 'onChange',
    defaultValues: {
      nombre: '',
      direccion: '',
      telefono: '',
      esPrincipal: false,
      estado: 'ACTIVO',
    },
  });

  const { data: sucursales, isLoading } = useQuery({
    queryKey: ['sucursales', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/sucursales')),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: async (values: SucursalFormValues) => apiPost('/sucursales', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sucursales'] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: 'Éxito', description: 'Sucursal creada correctamente.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string, values: SucursalFormValues }) => apiPut(`/sucursales/${data.id}`, data.values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sucursales'] });
      setIsDialogOpen(false);
      setEditingSucursal(null);
      form.reset();
      toast({ title: 'Éxito', description: 'Sucursal actualizada correctamente.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const { deleteItem } = useSoftDelete({
    queryKey: ['sucursales'],
    endpoint: 'sucursales',
    itemName: 'La sucursal'
  });

  const onSubmit = (values: SucursalFormValues) => {
    if (editingSucursal) {
      updateMutation.mutate({ id: editingSucursal.id, values });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleEdit = (sucursal: any) => {
    setEditingSucursal(sucursal);
    form.reset({
      nombre: sucursal.nombre,
      direccion: sucursal.direccion || '',
      telefono: sucursal.telefono || '',
      esPrincipal: sucursal.esPrincipal ?? false,
      estado: sucursal.estado || 'ACTIVO',
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingSucursal(null);
    form.reset({ nombre: '', direccion: '', telefono: '', esPrincipal: false, estado: 'ACTIVO' });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setConfirmConfig({
      title: '¿Eliminar sucursal?',
      description: 'Esta acción no se puede deshacer. La sucursal será desactivada permanentemente.',
      isDestructive: true,
      onConfirm: () => deleteItem(id),
    });
    setConfirmOpen(true);
  };

  if (!token) return null;

  const filteredSucursales = (sucursales || []).filter((sucursal: any) => {
    if (!searchTerm) return true;
    const lower = searchTerm.toLowerCase();
    return sucursal.nombre?.toLowerCase().includes(lower) || sucursal.direccion?.toLowerCase().includes(lower);
  });

  return (
    <Protect permission="sucursales:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sucursales</h2>
            <p className="text-sm text-slate-500 mt-1">Gestiona las sedes de tu organización.</p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar sucursal..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-xs"
              />
            </div>
            <Protect permission="sucursales:crear">
              <TenantRequiredButton
                onClick={handleAddNew}
                icon={<Plus className="mr-2 h-4 w-4" />}
                label="Nueva Sucursal"
              />
            </Protect>
          </div>
          <GlobalFormModal
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            title={editingSucursal ? 'Editar Sucursal' : 'Nueva Sucursal'}
            description={editingSucursal ? 'Modifica los detalles de la sucursal.' : 'Agrega una nueva sede a tu organización.'}
            form={form}
            sections={[
              {
                fields: [
                  { name: 'nombre', label: 'Nombre de la Sede', type: 'text', placeholder: 'Ej. Sede Central', colSpan: 2 },
                  { name: 'direccion', label: 'Dirección', type: 'text', placeholder: 'Ej. Av. Principal 123', colSpan: 2 },
                  { name: 'telefono', label: 'Teléfono (Solo números)', type: 'number', placeholder: 'Ej. 12345678' },
                  { name: 'estado', label: 'Estado', type: 'select', options: [{ label: 'Activo', value: 'ACTIVO' }, { label: 'Inactivo', value: 'INACTIVO' }] },
                  { name: 'esPrincipal', label: 'Sede Principal', type: 'switch', description: 'Marcar esta sucursal como la central.', colSpan: 2 },
                ]
              }
            ]}
            onSubmit={onSubmit}
            isPending={createMutation.isPending || updateMutation.isPending}
            submitLabel="Guardar Sede"
          />
        </div>

        {isLoading ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-8 flex justify-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-8 w-8 bg-slate-200 rounded-full"></div>
              <div className="h-4 w-32 bg-slate-200 rounded"></div>
            </div>
          </div>
        ) : filteredSucursales.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
              <Building2 className="w-6 h-6" />
            </div>
            <p className="text-base font-semibold text-slate-900">
              {searchTerm ? 'Ninguna sucursal coincide con la búsqueda' : 'No hay sucursales registradas'}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              {searchTerm ? 'Prueba con otro nombre o dirección.' : 'Agrega tu primera sede.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sede</TableHead>
                <TableHead>Dirección</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSucursales.map((sucursal: any) => (
                <TableRow key={sucursal.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 shrink-0">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{sucursal.nombre}</p>
                        {sucursal.esPrincipal && <p className="text-xs text-indigo-600 font-medium mt-0.5">Sede principal</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600">{sucursal.direccion || 'Sin dirección registrada'}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600">{sucursal.telefono || '-'}</span>
                  </TableCell>
                  <TableCell>
                    {sucursal.estado === 'ACTIVO' ? <Badge variant="success">Activo</Badge> : <Badge variant="default">Inactivo</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Protect permission="sucursales:actualizar">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(sucursal)} className="text-slate-500 hover:text-indigo-600">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </Protect>
                      <Protect permission="sucursales:eliminar">
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(sucursal.id)} className="text-slate-500 hover:text-rose-600">
                          <Trash2 className="h-4 w-4" />
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
