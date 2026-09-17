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
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { GlobalFormModal } from '@/components/ui/global-form-modal';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { Protect } from '@/components/ui/protect';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, Edit, Trash2, Mail, Phone, Search, ArchiveRestore } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PapeleraToggle } from '@/components/ui/papelera-toggle';
import { Label } from '@/components/ui/label';

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
  const [showDeleted, setShowDeleted] = useState(false);
  const { activeTenantId } = useTenantStore();

  const userSucursalId = user?.sucursalId;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    description: '',
    onConfirm: () => {},
    isDestructive: false
  });
  const [activeTab, setActiveTab] = useState<string>('todos');

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
    queryKey: ['clientes', activeTenantId, showDeleted],
    queryFn: async () => unwrapList(await apiGet(showDeleted ? '/clientes?deleted=true' : '/clientes')),
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

  const { deleteItem, restoreItem, isRestoring } = useSoftDelete({
    queryKey: ['clientes', showDeleted],
    endpoint: 'clientes',
    modelName: 'cliente',
    itemName: 'El cliente'
  });

  const { data: miOrganizacion } = useQuery({
    queryKey: ['organizacion'],
    queryFn: async () => apiGet('/organizaciones/me/info'),
    enabled: !!token && !user?.is_superadmin,
  });

  const onSubmit = (values: ClienteFormValues) => {
    const req = (miOrganizacion as any)?.configuracion?.requerimientosCliente;
    
    if (req?.exigirCorreo && !values.correo) {
      form.setError('correo', { type: 'manual', message: 'El correo es obligatorio por políticas del gimnasio.' });
      return;
    }
    if (req?.exigirDni && !values.numeroDocumento) {
      form.setError('numeroDocumento', { type: 'manual', message: 'El documento es obligatorio por políticas del gimnasio.' });
      return;
    }
    if (req?.exigirTelefono && !values.telefono) {
      form.setError('telefono', { type: 'manual', message: 'El teléfono es obligatorio por políticas del gimnasio.' });
      return;
    }

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
    if (activeTab === 'activos' && cliente.estado !== 'ACTIVO') return false;
    if (activeTab === 'inactivos' && cliente.estado === 'ACTIVO') return false;
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
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Directorio de Clientes</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Gestiona los miembros y asistentes del gimnasio.</p>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 shadow-xs"
              />
            </div>
            
            <PapeleraToggle showDeleted={showDeleted} setShowDeleted={setShowDeleted} />

            <Protect permission="clientes:crear">
              <TenantRequiredButton 
                onClick={handleAddNew} 
                icon={<Plus className="mr-2 h-4 w-4" />}
                label="Nuevo Cliente"
              />
            </Protect>
          </div>
        </div>

        <div className="flex justify-start">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-[400px]">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="activos">Activos</TabsTrigger>
              <TabsTrigger value="inactivos">Inactivos</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        
        <GlobalFormModal
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          title={editingCliente ? 'Editar Cliente' : 'Nuevo Cliente'}
          description={editingCliente ? 'Modifica los datos del cliente.' : 'Registra un nuevo miembro en el gimnasio.'}
          form={form as any}
          sections={formSections}
          onSubmit={onSubmit as any}
          isPending={createMutation.isPending || updateMutation.isPending}
          submitLabel="Guardar Cliente"
        />

        {isLoadingClientes ? (
          <TableSkeleton columns={5} showAvatar={true} />
        ) : filteredClientes.length === 0 ? (
          <EmptyState
            icon={Users}
            title={searchTerm ? 'Ningún cliente encontrado' : 'No hay clientes registrados'}
            description={searchTerm ? 'Prueba con otro nombre, correo o documento.' : 'Comienza agregando tu primer cliente al sistema. Ellos podrán acceder a las instalaciones e inscribirse en clases.'}
            actionLabel="Nuevo Cliente"
            actionIcon={<Plus className="w-4 h-4" />}
            onAction={handleAddNew}
            permission="clientes:crear"
            isSearch={!!searchTerm}
          />
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
                <TableRow key={cliente.id} className={showDeleted ? "bg-rose-50/40 dark:bg-rose-500/20 opacity-80" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-xs shrink-0">
                        {cliente.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">{cliente.nombre}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{cliente.sucursalBaseId ? 'Sede local' : 'Global'}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                      <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500"/> {cliente.correo || 'Sin correo'}</span>
                      <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500"/> {cliente.telefono || 'Sin teléfono'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      <span className="font-medium text-slate-900 dark:text-white">{cliente.tipoDocumento}</span>: {cliente.numeroDocumento || '-'}
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
                      {showDeleted ? (
                        <Protect permission="sistema:restaurar">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => restoreItem(cliente.id)} 
                            disabled={isRestoring}
                            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 h-8 px-3"
                          >
                            <ArchiveRestore className="h-4 w-4 mr-2" /> Restaurar
                          </Button>
                        </Protect>
                      ) : (
                        <>
                          <Protect permission="clientes:actualizar" fallbackType="hide">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(cliente)} className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </Protect>
                          <Protect permission="clientes:eliminar" fallbackType="hide">
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(cliente.id)} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400">
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
