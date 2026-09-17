"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, apiPut, unwrapList } from '@/lib/api-client';
import { Protect } from '@/components/ui/protect';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Checkbox } from '@/components/ui/checkbox';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { GlobalFormModal } from '@/components/ui/global-form-modal';
import { ArqueoCajaWizard } from '@/components/ui/arqueo-caja-wizard';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Wallet, Plus, Edit, Trash2, KeyRound, AlertCircle, CheckCircle2, LockKeyhole, Search, ArchiveRestore } from 'lucide-react';
import { useSoftDelete } from '@/hooks/use-soft-delete';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PapeleraToggle } from '@/components/ui/papelera-toggle';

const cajaSchema = z.object({
  nombre: z.string().min(3, "El nombre de la caja es obligatorio"),
  sucursalId: z.string().min(1, "Debes seleccionar una sucursal"),
  estado: z.enum(['ABIERTA', 'CERRADA', 'MANTENIMIENTO']).optional(),
});

type CajaFormValues = z.infer<typeof cajaSchema>;

export default function CajasPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token } = useAuth();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingCaja, setEditingCaja] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const { activeTenantId } = useTenantStore();

  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    description: '',
    onConfirm: () => {},
    isDestructive: false
  });
  
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [aperturaModalOpen, setAperturaModalOpen] = useState(false);
  const [cajaToOpen, setCajaToOpen] = useState<any>(null);
  const [montoInicial, setMontoInicial] = useState('0');

  const [arqueoModalOpen, setArqueoModalOpen] = useState(false);
  const [montoCierreReal, setMontoCierreReal] = useState('');
  const [montoExtraido, setMontoExtraido] = useState('');
  const [observacionesArqueo, setObservacionesArqueo] = useState('');

  const form = useForm<CajaFormValues>({
    resolver: zodResolver(cajaSchema),
    mode: 'onChange',
    defaultValues: {
      nombre: '',
      sucursalId: '',
      estado: 'CERRADA',
    },
  });

  const { data: sucursales } = useQuery({
    queryKey: ['sucursales', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/sucursales')),
    enabled: !!token,
  });

  const { data: cajas, isLoading: loadingCajas } = useQuery({
    queryKey: ['cajas', activeTenantId, showDeleted],
    queryFn: async () => unwrapList(await apiGet(showDeleted ? '/cajas-registradoras?deleted=true' : '/cajas-registradoras')),
    enabled: !!token,
  });

  const { data: estadoApertura, isLoading: loadingEstado } = useQuery<any>({
    queryKey: ['apertura-caja', 'me'],
    queryFn: async () => apiGet('/apertura-caja/me'),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: async (values: CajaFormValues) => apiPost('/cajas-registradoras', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cajas'] });
      setIsSheetOpen(false);
      form.reset();
      toast({ title: 'Éxito', description: 'Caja registrada correctamente.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string, values: CajaFormValues }) => apiPut(`/cajas-registradoras/${data.id}`, data.values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cajas'] });
      setIsSheetOpen(false);
      setEditingCaja(null);
      form.reset();
      toast({ title: 'Éxito', description: 'Caja actualizada correctamente.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const abrirCajaMutation = useMutation({
    mutationFn: async () => apiPost('/apertura-caja/abrir', {
      cajaId: cajaToOpen.id,
      montoInicial: Number(montoInicial)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apertura-caja', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['cajas'] });
      setAperturaModalOpen(false);
      setCajaToOpen(null);
      setMontoInicial('0');
      toast({ title: 'Caja Abierta', description: 'Has iniciado tu turno correctamente.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const cerrarCajaMutation = useMutation({
    mutationFn: async () => apiPost('/apertura-caja/cerrar', {
      montoCierreReal: Number(montoCierreReal),
      montoExtraido: Number(montoExtraido),
      observaciones: observacionesArqueo
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apertura-caja', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['cajas'] });
      setArqueoModalOpen(false);
      setMontoCierreReal('');
      setMontoExtraido('');
      setObservacionesArqueo('');
      toast({ title: 'Caja Cerrada', description: 'Tu turno ha sido cerrado y arqueado.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const { deleteItem, restoreItem, isRestoring } = useSoftDelete({
    queryKey: ['cajas', showDeleted],
    endpoint: 'cajas-registradoras',
    modelName: 'cajaRegistradora',
    itemName: 'La caja registradora'
  });

  const onSubmit = (values: CajaFormValues) => {
    if (editingCaja) {
      updateMutation.mutate({ id: editingCaja.id, values });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleEdit = (caja: any) => {
    setEditingCaja(caja);
    form.reset({
      nombre: caja.nombre,
      sucursalId: caja.sucursalId,
      estado: caja.estado,
    });
    setIsSheetOpen(true);
  };

  const handleAddNew = () => {
    setEditingCaja(null);
    form.reset({ nombre: '', sucursalId: '', estado: 'CERRADA' });
    setIsSheetOpen(true);
  };

  const handleDelete = (id: string, nombre: string) => {
    setConfirmConfig({
      title: '¿Eliminar caja registradora?',
      description: `Esta acción no se puede deshacer. La caja "${nombre}" será desactivada permanentemente.`,
      isDestructive: true,
      onConfirm: () => deleteItem(id),
    });
    setConfirmOpen(true);
  };

  const handleOpenTurno = (caja: any) => {
    setCajaToOpen(caja);
    setMontoInicial('0');
    setAperturaModalOpen(true);
  };

  if (!token) return null;

  const filteredCajas = (cajas || []).filter((caja: any) => {
    if (!searchTerm) return true;
    const lower = searchTerm.toLowerCase();
    return caja.nombre?.toLowerCase().includes(lower) || caja.sucursal?.nombre?.toLowerCase().includes(lower);
  });

  return (
    <Protect permission="cajas_registradoras:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Cajas Registradoras</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Gestiona los puntos de cobro físicos de tus sucursales.</p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Buscar caja..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 shadow-xs"
              />
            </div>
            
            <PapeleraToggle showDeleted={showDeleted} setShowDeleted={setShowDeleted} />

            <Protect permission="cajas_registradoras:crear" fallbackType="hide">
              <TenantRequiredButton
                onClick={handleAddNew}
                icon={<Plus className="mr-2 h-4 w-4" />}
                label="Nueva Caja"
              />
            </Protect>
          </div>

          <GlobalFormModal
            open={isSheetOpen}
            onOpenChange={setIsSheetOpen}
            title={editingCaja ? 'Editar Caja Registradora' : 'Crear Nueva Caja'}
            description={editingCaja ? 'Modifica los datos y estado operativo de la caja.' : 'Abre un nuevo punto de facturación/cobro en tu sucursal.'}
            form={form as any}
            sections={[
              {
                fields: [
                  { name: 'nombre', label: 'Nombre o Identificador', type: 'text', placeholder: 'Ej. Caja Principal', colSpan: 2 },
                  { 
                    name: 'sucursalId', 
                    label: 'Sucursal (Ubicación)', 
                    type: 'select', 
                    placeholder: 'Selecciona una sucursal',
                    options: sucursales?.map((s: any) => ({ label: s.nombre, value: s.id })) || [],
                    colSpan: 2
                  },
                  ...(editingCaja ? [
                    { 
                      name: 'estado', 
                      label: 'Estado Operativo', 
                      type: 'select' as const, 
                      options: [
                        { label: 'Cerrada', value: 'CERRADA' },
                        { label: 'Abierta', value: 'ABIERTA', className: 'text-emerald-600 dark:text-emerald-400 font-medium' },
                        { label: 'En Mantenimiento', value: 'MANTENIMIENTO', className: 'text-amber-600 dark:text-amber-400 font-medium' },
                      ],
                      colSpan: 2 as const
                    }
                  ] : [])
                ]
              }
            ]}
            onSubmit={onSubmit as any}
            isPending={createMutation.isPending || updateMutation.isPending}
            submitLabel="Guardar Caja"
          />
        </div>

        {/* Banner de Estado de Caja Actual */}
        {!loadingEstado && estadoApertura?.abierta && (
          <div className="bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-900/50 p-6 rounded-xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-emerald-900 dark:text-emerald-100 text-lg">Tienes un turno de caja activo</h3>
                <p className="text-emerald-700 dark:text-emerald-300">Caja: {estadoApertura?.apertura?.caja?.nombre} | Monto Inicial: Bs. {estadoApertura?.apertura?.montoInicial}</p>
              </div>
            </div>
            <Button 
                variant="destructive" 
                className="bg-red-600 hover:bg-red-700 shadow-md font-bold" 
                onClick={() => {
                  setMontoCierreReal(estadoApertura?.apertura?.caja?.saldoActual);
                  setMontoExtraido('0');
                  setArqueoModalOpen(true);
                }}
            >
                <LockKeyhole className="w-4 h-4 mr-2" /> Cerrar Turno (Arqueo)
            </Button>
          </div>
        )}
        {!loadingEstado && !estadoApertura?.abierta && (
          <div className="bg-amber-50 dark:bg-amber-500/20 border border-amber-200 dark:border-amber-900/50 p-6 rounded-xl flex items-center gap-4 shadow-sm">
             <div className="w-12 h-12 bg-amber-100 dark:bg-amber-500/20 rounded-full flex items-center justify-center text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-amber-900 dark:text-amber-100 text-lg">No tienes un turno abierto</h3>
                <p className="text-amber-700 dark:text-amber-300">Para poder procesar ventas y cobrar membresías, necesitas abrir tu turno en alguna de las cajas registradoras listadas abajo.</p>
              </div>
          </div>
        )}

        {loadingCajas ? (
          <TableSkeleton columns={5} />
        ) : filteredCajas.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={searchTerm ? 'Ninguna caja encontrada' : 'No hay cajas registradas'}
            description={searchTerm ? 'Prueba con otro nombre o sucursal.' : 'Crea tu primer punto de cobro para poder procesar transacciones y membresías.'}
            actionLabel="Nueva Caja"
            actionIcon={<Plus className="w-4 h-4" />}
            onAction={handleAddNew}
            permission="cajas_registradoras:crear"
            isSearch={!!searchTerm}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Caja Registradora</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead>Saldo Actual</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCajas.map((caja: any) => (
                <TableRow key={caja.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-700 dark:text-indigo-300 shrink-0">
                        <Wallet className="h-4 w-4" />
                      </div>
                      <p className="font-semibold text-slate-900 dark:text-white text-sm">{caja.nombre}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600 dark:text-slate-400">{caja.sucursal?.nombre || 'Desconocida'}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-bold text-slate-900 dark:text-white">
                      Bs. {Number(caja.saldoActual).toLocaleString('es-BO', { minimumFractionDigits: 2 })}
                    </span>
                  </TableCell>
                  <TableCell>
                    {caja.estado === 'ABIERTA' && <Badge variant="success">Abierta</Badge>}
                    {caja.estado === 'CERRADA' && <Badge variant="default">Cerrada</Badge>}
                    {caja.estado === 'MANTENIMIENTO' && <Badge variant="warning">Mantenimiento</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {showDeleted ? (
                        <Protect permission="sistema:restaurar">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => restoreItem(caja.id)} 
                            disabled={isRestoring}
                            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 h-8 px-3"
                          >
                            <ArchiveRestore className="h-4 w-4 mr-2" /> Restaurar
                          </Button>
                        </Protect>
                      ) : (
                        <>
                          {caja.estado === 'CERRADA' && !estadoApertura?.abierta && (
                            <Button variant="default" size="sm" className="bg-indigo-600 hover:bg-indigo-700 font-bold" onClick={() => handleOpenTurno(caja)}>
                              <KeyRound className="h-4 w-4 mr-1.5" /> Abrir Turno
                            </Button>
                          )}
                          <Protect permission="cajas_registradoras:actualizar" fallbackType="hide">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(caja)} className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </Protect>
                          <Protect permission="cajas_registradoras:eliminar">
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(caja.id, caja.nombre)} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400">
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

        <GlobalFormModal
          isOpen={aperturaModalOpen}
          onClose={() => setAperturaModalOpen(false)}
          title="Abrir Turno de Caja"
          description={`Vas a iniciar operaciones en la caja: ${cajaToOpen?.nombre}`}
          fields={[
            {
              name: 'montoInicial',
              label: 'Monto Inicial (Efectivo en Caja en Bs.)',
              type: 'number',
            }
          ]}
          defaultValues={{ montoInicial: '0' }}
          onSubmit={async (data) => {
             setMontoInicial(data.montoInicial);
             await abrirCajaMutation.mutateAsync();
          }}
        />

        <ArqueoCajaWizard
          isOpen={arqueoModalOpen}
          onClose={() => setArqueoModalOpen(false)}
          estadoApertura={estadoApertura}
          isPending={cerrarCajaMutation.isPending}
          onSubmit={async (data) => {
             setMontoCierreReal(data.montoCierreReal);
             setMontoExtraido(data.montoExtraido);
             setObservacionesArqueo(data.observaciones);
             await cerrarCajaMutation.mutateAsync();
          }}
        />
      </div>
    </Protect>
  );
}
