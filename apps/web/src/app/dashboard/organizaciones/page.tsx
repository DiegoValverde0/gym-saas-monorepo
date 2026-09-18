"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, apiDelete, unwrapList } from '@/lib/api-client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { GlobalFormModal } from '@/components/ui/global-form-modal';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Globe, Plus, Ban, RotateCcw, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const createSchema = z.object({
  nombreOrg: z.string({ message: "Obligatorio" }).min(3, "Mínimo 3 caracteres"),
  nombreAdmin: z.string({ message: "Obligatorio" }).min(3, "Mínimo 3 caracteres"),
  correo: z.string({ message: "Obligatorio" }).email("Correo inválido"),
  contrasena: z.string({ message: "Obligatorio" }).min(8, "Mínimo 8 caracteres"),
});

type CreateFormValues = z.infer<typeof createSchema>;

interface Organizacion {
  id: string;
  nombre: string;
  estado: string;
  createdAt: string;
}

// El superadmin ya no puede editar los datos de una organización (ver
// Auditoria_Claude.md): solo puede crearla con su admin, o suspenderla /
// reactivarla. No existe más un formulario de "editar organización".
export default function OrganizacionesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token, user, isReady } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    description: '',
    onConfirm: () => {},
    isDestructive: false
  });

  useEffect(() => {
    if (isReady && token && !user?.is_superadmin) {
      router.push('/dashboard');
    }
  }, [isReady, token, user, router]);

  const createForm = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    mode: 'onChange',
    defaultValues: {
      nombreOrg: '',
      nombreAdmin: '',
      correo: '',
      contrasena: '',
    },
  });

  const { data: organizaciones, isLoading } = useQuery({
    queryKey: ['organizaciones'],
    queryFn: async () => unwrapList(await apiGet('/organizaciones')),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: async (values: CreateFormValues) => apiPost('/organizaciones', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizaciones'] });
      setIsDialogOpen(false);
      createForm.reset();
      toast({ title: 'Éxito', description: 'Organización registrada correctamente.', variant: 'success' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => apiPost(`/organizaciones/${id}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizaciones'] });
      toast({ title: 'Reactivada', description: 'La organización ha sido reactivada.', variant: 'success' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const suspenderMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiDelete(`/organizaciones/${id}`);
      return { id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['organizaciones'] });
      toast({
        title: 'Organización suspendida',
        description: 'Puedes reactivarla en cualquier momento desde esta pantalla.',
        variant: 'success',
        duration: 5000,
        action: (
          <Button
            variant="outline"
            size="sm"
            className="border-white text-zinc-900 dark:text-white bg-white dark:bg-slate-900 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => restoreMutation.mutate(data.id)}
          >
            Deshacer
          </Button>
        )
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const handleCreateSubmit = (values: CreateFormValues) => {
    createMutation.mutate(values);
  };

  const handleAddNew = () => {
    createForm.reset({ nombreOrg: '', nombreAdmin: '', correo: '', contrasena: '' });
    setIsDialogOpen(true);
  };

  const handleSuspender = (id: string) => {
    setConfirmConfig({
      title: '¿Suspender Organización?',
      description: 'Esta acción suspende temporalmente el acceso de esta organización y de todo su staff. Puedes reactivarla cuando quieras.',
      isDestructive: true,
      onConfirm: () => suspenderMutation.mutate(id),
    });
    setConfirmOpen(true);
  };

  if (!token) return null;

  const filteredOrganizaciones = (organizaciones as Organizacion[] || []).filter((org: Organizacion) => {
    if (!searchTerm) return true;
    return org.nombre?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Registro de Organizaciones</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Panel de SuperAdmin: Administra a todos los clientes del sistema SaaS.</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Buscar organización..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 shadow-xs"
            />
          </div>
        <Button className="bg-indigo-600 hover:bg-indigo-500 text-white" onClick={handleAddNew}>
          <Plus className="mr-2 h-4 w-4" /> Nueva Organización
        </Button>

        <GlobalFormModal
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          title="Registrar Nuevo Cliente SaaS"
          description="Creará la organización, la sede central y la cuenta de administrador automáticamente."
          form={createForm as any}
          sections={[
            {
              fields: [
                { name: 'nombreOrg', label: 'Nombre del Gimnasio', type: 'text', placeholder: 'Ej. Titan Gym', colSpan: 2 },
                { name: 'nombreAdmin', label: 'Nombre del Dueño/Admin', type: 'text', placeholder: 'Ej. Juan Pérez', colSpan: 2 },
                { name: 'correo', label: 'Correo Electrónico (Admin)', type: 'email', placeholder: 'ejemplo@gym.com', colSpan: 2 },
                { name: 'contrasena', label: 'Contraseña (Admin)', type: 'password', placeholder: '******', colSpan: 2 },
              ],
            },
          ]}
          onSubmit={handleCreateSubmit as any}
          isPending={createMutation.isPending}
          submitLabel="Registrar Cliente"
        />
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-8 flex justify-center">
          <div className="animate-pulse flex flex-col items-center gap-4">
            <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
            <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded"></div>
          </div>
        </div>
      ) : filteredOrganizaciones.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-12 text-center flex flex-col items-center">
          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-full flex items-center justify-center mb-4">
            <Globe className="w-6 h-6" />
          </div>
          <p className="text-base font-semibold text-slate-900 dark:text-white">
            {searchTerm ? 'Ninguna organización coincide con la búsqueda' : 'No hay organizaciones registradas'}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {searchTerm ? 'Prueba con otro nombre.' : 'Registra el primer cliente del sistema.'}
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organización</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha de Registro</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrganizaciones.map((org: Organizacion) => (
              <TableRow key={org.id} className={org.estado === 'SUSPENDIDO' ? 'opacity-60' : ''}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-700 dark:text-indigo-300 shrink-0">
                      <Globe className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white text-sm">{org.nombre}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">ID: {org.id.substring(0, 8)}...</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {org.estado === 'ACTIVO' && <Badge variant="success">Activo</Badge>}
                  {org.estado === 'SUSPENDIDO' && <Badge variant="destructive">Suspendido</Badge>}
                  {org.estado === 'INACTIVO' && <Badge variant="default">Inactivo</Badge>}
                </TableCell>
                <TableCell>
                  <span className="text-xs text-slate-600 dark:text-slate-400">{new Date(org.createdAt).toLocaleDateString()}</span>
                </TableCell>
                <TableCell className="text-right">
                  {org.estado === 'SUSPENDIDO' ? (
                    <Button variant="ghost" size="icon" onClick={() => restoreMutation.mutate(org.id)} title="Reactivar" className="text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400">
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" onClick={() => handleSuspender(org.id)} title="Suspender" className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400">
                      <Ban className="h-4 w-4" />
                    </Button>
                  )}
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
  );
}
