"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, apiPatch, unwrapList } from '@/lib/api-client';
import { useForm } from 'react-hook-form';
import { useSoftDelete } from '@/hooks/use-soft-delete';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { GlobalFormModal } from '@/components/ui/global-form-modal';
import { Protect } from '@/components/ui/protect';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, Edit, Trash2, Mail, Phone, MapPin, Search, MoreVertical, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const clienteSchema = z.object({
  sucursalBaseId: z.string().optional(),
  nombre: z.string({ message: "El nombre es obligatorio" }).min(3, "Mínimo 3 caracteres"),
  correo: z.string().email("Correo inválido").optional().or(z.literal("")),
  telefono: z.string().optional(),
  tipoDocumento: z.string().optional(),
  numeroDocumento: z.string().optional(),
  estado: z.string().optional(),
});

type ClienteFormValues = z.infer<typeof clienteSchema>;

export default function ClientesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { activeTenantId } = useTenantStore();

  const userOrgId = user?.organizacionId;
  const userSucursalId = user?.sucursalId;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    description: '',
    onConfirm: () => {},
    isDestructive: false
  });

  const form = useForm<ClienteFormValues>({
    resolver: zodResolver(clienteSchema),
    mode: 'onChange',
    defaultValues: {
      nombre: '',
      correo: '',
      telefono: '',
      numeroDocumento: '',
      tipoDocumento: 'CI',
      estado: 'ACTIVO',
      sucursalBaseId: '',
    },
  });

  const { data: clientes, isLoading: isLoadingClientes } = useQuery({
    queryKey: ['clientes', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/clientes')),
    enabled: !!token,
  });

  const { data: sucursales } = useQuery({
    queryKey: ['sucursales', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/sucursales')),
    enabled: !!token && !userSucursalId,
  });

  const createMutation = useMutation({
    mutationFn: async (values: ClienteFormValues) => {
      const payload = { ...values };
      // Si el usuario tiene una sucursal vinculada en el token, lo forzamos.
      if (userSucursalId) {
          payload.sucursalBaseId = userSucursalId;
      }
      // Eliminar si está vacío
      if (!payload.sucursalBaseId) {
          delete payload.sucursalBaseId;
      }

      return apiPost('/clientes', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: 'Éxito', description: 'Cliente creado correctamente.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string, values: ClienteFormValues }) => {
      const payload = { ...data.values };
      if (!payload.sucursalBaseId) delete payload.sucursalBaseId;
      if (userSucursalId) delete payload.sucursalBaseId; // No dejamos que cambie su sucursal base si el admin es de una específica.

      return apiPatch(`/clientes/${data.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      setIsDialogOpen(false);
      setEditingCliente(null);
      form.reset();
      toast({ title: 'Éxito', description: 'Cliente actualizado correctamente.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const { deleteItem } = useSoftDelete({
    queryKey: ['clientes'],
    endpoint: 'clientes',
    itemName: 'El cliente'
  });

  const onSubmit = (values: ClienteFormValues) => {
    if (editingCliente) {
      updateMutation.mutate({ id: editingCliente.id, values });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleEdit = (cliente: any) => {
    setEditingCliente(cliente);
    form.reset({
      nombre: cliente.nombre,
      correo: cliente.correo || '',
      telefono: cliente.telefono || '',
      tipoDocumento: cliente.tipoDocumento || 'CI',
      numeroDocumento: cliente.numeroDocumento || '',
      estado: cliente.estado || 'ACTIVO',
      sucursalBaseId: cliente.sucursalBaseId || '',
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    if (!userOrgId && (!activeTenantId || activeTenantId === 'all')) {
      toast({ title: 'Acción requerida', description: 'Por favor, selecciona una organización en el menú superior antes de crear un cliente.', variant: 'destructive' });
      return;
    }
    setEditingCliente(null);
    form.reset({
      nombre: '',
      correo: '',
      telefono: '',
      tipoDocumento: 'CI',
      numeroDocumento: '',
      estado: 'ACTIVO',
      sucursalBaseId: userSucursalId || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setConfirmConfig({
      title: '¿Eliminar cliente?',
      description: 'Esta acción no se puede deshacer de forma inmediata.',
      isDestructive: true,
      onConfirm: () => deleteItem(id),
    });
    setConfirmOpen(true);
  };

  if (!token) return null;

  const filteredClientes = (clientes || []).filter((cliente: any) => {
    if (!searchTerm) return true;
    const lower = searchTerm.toLowerCase();
    return (
      cliente.nombre?.toLowerCase().includes(lower) ||
      cliente.correo?.toLowerCase().includes(lower) ||
      cliente.numeroDocumento?.toLowerCase().includes(lower)
    );
  });

  const formSections: any[] = [
    {
      fields: [
        { name: 'nombre', label: 'Nombre Completo', type: 'text', placeholder: 'Ej. Juan Pérez', colSpan: 2 },
        { name: 'correo', label: 'Correo Electrónico', type: 'email', placeholder: 'juan@ejemplo.com' },
        { name: 'telefono', label: 'Teléfono', type: 'text', placeholder: 'Ej. 77712345' },
        { name: 'tipoDocumento', label: 'Tipo Documento', type: 'select', options: [{ label: 'CI', value: 'CI' }, { label: 'Pasaporte', value: 'PASAPORTE' }, { label: 'Extranjero', value: 'CARNET_EXTRANJERO' }] },
        { name: 'numeroDocumento', label: 'Número de Documento', type: 'text', placeholder: 'Ej. 1234567' },
        { name: 'estado', label: 'Estado', type: 'select', options: [{ label: 'Activo', value: 'ACTIVO' }, { label: 'Inactivo', value: 'INACTIVO' }, { label: 'Moroso', value: 'MOROSO' }, { label: 'Suspendido', value: 'SUSPENDIDO' }], colSpan: 2 },
      ]
    }
  ];

  if (!userSucursalId) {
    const options = (sucursales || []).map((s: any) => ({ label: s.nombre, value: s.id }));
    formSections[0].fields.push({
      name: 'sucursalBaseId',
      label: 'Sucursal Base',
      type: 'select',
      options: options,
      colSpan: 2
    });
  }

  return (
    <Protect permission="clientes:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Directorio de Clientes</h2>
            <p className="text-sm text-slate-500 mt-1">Gestiona los miembros y asistentes del gimnasio.</p>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-xs"
              />
            </div>
            <Protect permission="clientes:crear">
              <TenantRequiredButton 
                onClick={handleAddNew} 
                icon={<Plus className="mr-2 h-4 w-4" />}
                label="Nuevo Cliente"
              />
            </Protect>
          </div>
        </div>

        <GlobalFormModal
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          title={editingCliente ? 'Editar Cliente' : 'Nuevo Cliente'}
          description={editingCliente ? 'Modifica los datos del cliente.' : 'Registra un nuevo miembro en el gimnasio.'}
          form={form}
          sections={formSections}
          onSubmit={onSubmit}
          isPending={createMutation.isPending || updateMutation.isPending}
          submitLabel="Guardar Cliente"
        />

        {isLoadingClientes ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-8 flex justify-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-8 w-8 bg-slate-200 rounded-full"></div>
              <div className="h-4 w-32 bg-slate-200 rounded"></div>
            </div>
          </div>
        ) : filteredClientes.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
              <Users className="w-6 h-6" />
            </div>
            <p className="text-base font-semibold text-slate-900">
              {searchTerm ? 'Ningún cliente coincide con la búsqueda' : 'No hay clientes registrados'}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              {searchTerm ? 'Prueba con otro nombre, correo o documento.' : 'Comienza agregando tu primer cliente al sistema.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClientes.map((cliente: any) => (
                <TableRow key={cliente.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs shrink-0">
                        {cliente.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{cliente.nombre}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{cliente.sucursalBaseId ? 'Sede local' : 'Global'}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-xs text-slate-600">
                      <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-slate-400"/> {cliente.correo || 'Sin correo'}</span>
                      <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-slate-400"/> {cliente.telefono || 'Sin teléfono'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-slate-600">
                      <span className="font-medium text-slate-900">{cliente.tipoDocumento}</span>: {cliente.numeroDocumento || '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    {cliente.estado === 'ACTIVO' && <Badge variant="success">Activo</Badge>}
                    {cliente.estado === 'INACTIVO' && <Badge variant="default">Inactivo</Badge>}
                    {cliente.estado === 'MOROSO' && <Badge variant="warning">Moroso</Badge>}
                    {cliente.estado === 'SUSPENDIDO' && <Badge variant="destructive">Suspendido</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Protect permission="clientes:actualizar">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(cliente)} className="text-slate-500 hover:text-indigo-600">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </Protect>
                      <Protect permission="clientes:eliminar">
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(cliente.id)} className="text-slate-500 hover:text-rose-600">
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
