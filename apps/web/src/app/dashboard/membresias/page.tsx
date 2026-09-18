"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, unwrapList } from '@/lib/api-client';
import { useSoftDelete } from '@/hooks/use-soft-delete';
import { Button } from '@/components/ui/button';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { MembresiaWizardModal, membresiaWizardSchema } from '@/components/ui/membresia-wizard-modal';
import { Protect } from '@/components/ui/protect';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { IdCard, Plus, Trash2, Clock, CalendarDays, Search, Edit, Eye, Banknote, ArchiveRestore } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PapeleraToggle } from '@/components/ui/papelera-toggle';
import { POSModal } from './POSModal';
import type { z } from 'zod';

type MembresiaFormValues = z.infer<typeof membresiaWizardSchema>;

export default function MembresiasPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token, user } = useAuth();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // Membresía PENDIENTE_PAGO que se está "editando" (null = venta nueva). El
  // wizard usa esto para precargarse y arrancar en el paso 2 -- antes esta
  // página tenía su propio `form` desconectado del wizard (que tiene el
  // suyo propio), así que "Editar" siempre abría un formulario en blanco,
  // idéntico a "Nueva Venta". Ver membresia-wizard-modal.tsx.
  const [editingMembresia, setEditingMembresia] = useState<any | null>(null);

  const [detailsMembresia, setDetailsMembresia] = useState<any | null>(null);
  const [posOpen, setPosOpen] = useState(false);
  const [itemToCobrar, setItemToCobrar] = useState<any>(null);

  const { activeTenantId } = useTenantStore();

  const userSucursalId = user?.sucursalId;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    description: '',
    onConfirm: () => {},
    isDestructive: false
  });

  const [directorySearch, setDirectorySearch] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);

  // Consultas
  const { data: membresias, isLoading } = useQuery({
    queryKey: ['membresias', activeTenantId, showDeleted],
    queryFn: async () => unwrapList(await apiGet(showDeleted ? '/membresias?deleted=true' : '/membresias')),
    enabled: !!token,
  });

  const { data: clientes } = useQuery({
    queryKey: ['clientes', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/clientes')),
    enabled: !!token,
  });

  const { data: planes } = useQuery({
    queryKey: ['planes', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/planes')),
    enabled: !!token,
  });

  const { data: promociones } = useQuery({
    queryKey: ['promociones', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/promociones')),
    enabled: !!token,
  });

  const { data: sucursales } = useQuery({
    queryKey: ['sucursales', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/sucursales')),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: async (values: MembresiaFormValues) => {
      const payload: any = { ...values };
      if (!payload.promocionId) delete payload.promocionId;

      // Manejar el valor de la sucursal
      if (userSucursalId) {
        payload.sucursalId = userSucursalId;
      }
      if (!payload.sucursalId) {
        delete payload.sucursalId;
      }

      payload.fechaInicio = new Date(payload.fechaInicio).toISOString();

      return apiPost('/membresias', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['membresias'] });
      setIsDialogOpen(false);
      setEditingMembresia(null);
      toast({ title: 'Éxito', description: 'Membresía creada (Pendiente de Pago).', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  // No existe un PATCH real para "editar" una membresía PENDIENTE_PAGO:
  // UpdateMembresiaDto (backend) solo permite cambiar `estado` (transiciones
  // como cancelar/congelar), no plan/promoción/fecha. Por eso "editar" sigue
  // siendo un POST -- el backend cancela automáticamente la PENDIENTE_PAGO
  // anterior del cliente antes de crear la nueva (ver membresia.service.ts,
  // create(), paso 1). El wizard ahora sí precarga los valores anteriores y
  // lo deja claro en el paso 2 (antes abría en blanco, como una venta nueva).
  const onSubmit = (values: MembresiaFormValues) => {
    createMutation.mutate(values);
  };

  const { deleteItem, restoreItem, isRestoring } = useSoftDelete({
    queryKey: ['membresias', activeTenantId, showDeleted],
    endpoint: 'membresias',
    itemName: 'La membresía',
    modelName: 'membresia'
  });

  const handleAddNew = () => {
    setEditingMembresia(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (membresia: any) => {
    setEditingMembresia(membresia);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setConfirmConfig({
      title: '¿Anular membresía?',
      description: 'Esta acción cancelará permanentemente la membresía.',
      isDestructive: true,
      onConfirm: () => deleteItem(id),
    });
    setConfirmOpen(true);
  };

  const clientesList = clientes || [];
  const planesList = planes || [];
  const promocionesList = promociones || [];
  const membresiasList = membresias || [];
  const filteredMembresias = membresiasList.filter((m: any) => {
    if (!directorySearch) return true;
    const lower = directorySearch.toLowerCase();
    return m.cliente?.nombre?.toLowerCase().includes(lower) || m.plan?.nombre?.toLowerCase().includes(lower);
  });

  if (!token) return null;

  const getStateColor = (estado: string) => {
    switch (estado) {
        case 'PENDIENTE_PAGO': return 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-900/50';
        case 'EN_ESPERA': return 'bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-900/50';
        case 'ACTIVA': return 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900/50';
        case 'VENCIDA': return 'bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-200 border-red-200 dark:border-red-900/50';
        case 'CONGELADA': return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700';
        case 'CANCELADA': return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 border-zinc-200 dark:border-zinc-800 line-through';
        default: return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 border-zinc-200 dark:border-zinc-800';
    }
  }

  const formatDateDisplay = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    // Para compensar UTC si es necesario o simplificar:
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  return (
    <Protect permission="membresias:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Membresías</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Registra y administra los accesos de tus clientes.</p>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Buscar membresía..."
                value={directorySearch}
                onChange={(e) => setDirectorySearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 shadow-xs"
              />
            </div>
            <PapeleraToggle showDeleted={showDeleted} setShowDeleted={setShowDeleted} />

            <Protect permission="membresias:crear">
              <TenantRequiredButton
                onClick={handleAddNew}
                icon={<Plus className="mr-2 h-4 w-4" />}
                label="Nueva Venta"
              />
            </Protect>
          </div>
        </div>

        <MembresiaWizardModal
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          onSubmit={onSubmit as any}
          isPending={createMutation.isPending}
          clientes={clientesList}
          planes={planesList.filter((p: any) => p.estado === 'ACTIVO')}
          promociones={promocionesList.filter((p: any) => p.estado === 'ACTIVO')}
          sucursales={sucursales || []}
          userSucursalId={userSucursalId || undefined}
          editingMembresia={editingMembresia}
        />

        {isLoading ? (
          <TableSkeleton columns={5} showAvatar={true} />
        ) : filteredMembresias.length === 0 ? (
          <EmptyState
            icon={IdCard}
            title={directorySearch ? 'Ninguna membresía coincide con la búsqueda' : 'No hay membresías vendidas'}
            description={directorySearch ? 'Prueba con otro cliente o plan.' : 'Registra la primera venta para comenzar.'}
            actionLabel="Nueva Venta"
            actionIcon={<Plus className="w-4 h-4" />}
            onAction={handleAddNew}
            permission="membresias:crear"
            isSearch={!!directorySearch}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente y Plan</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMembresias.map((membresia: any) => (
                <TableRow key={membresia.id} className={showDeleted ? "bg-rose-50/40 dark:bg-rose-500/20 opacity-80" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-xs shrink-0">
                        {membresia.cliente?.nombre?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white text-sm truncate max-w-[200px]">{membresia.cliente?.nombre}</p>
                        <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium truncate max-w-[200px]">{membresia.plan?.nombre}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-bold text-slate-900 dark:text-white">${Number(membresia.montoFinal).toFixed(2)}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                      <span className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500"/> {formatDateDisplay(membresia.fechaInicio)}</span>
                      {membresia.fechaFin ? (
                        <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500"/> Vence: {formatDateDisplay(membresia.fechaFin)}</span>
                      ) : (
                        <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500"/> Ilimitado</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {membresia.estado === 'ACTIVA' && <Badge variant="success">Activa</Badge>}
                    {membresia.estado === 'PENDIENTE_PAGO' && <Badge variant="warning">Pendiente</Badge>}
                    {membresia.estado === 'EN_ESPERA' && <Badge variant="primary">En Espera</Badge>}
                    {membresia.estado === 'VENCIDA' && <Badge variant="destructive">Vencida</Badge>}
                    {membresia.estado === 'CONGELADA' && <Badge variant="default">Congelada</Badge>}
                    {membresia.estado === 'CANCELADA' && <Badge variant="default" className="line-through opacity-75">Cancelada</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {showDeleted ? (
                        <Protect permission="sistema:restaurar">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => restoreItem(membresia.id)}
                            disabled={isRestoring}
                            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 h-8 px-3"
                          >
                            <ArchiveRestore className="h-4 w-4 mr-2" /> Restaurar
                          </Button>
                        </Protect>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400" onClick={() => setDetailsMembresia(membresia)}>
                              <Eye className="h-4 w-4" />
                          </Button>
                          {membresia.estado === 'PENDIENTE_PAGO' && (
                              <>
                                <Protect permission="transacciones:crear">
                                    <Button variant="ghost" size="icon" className="text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/20" onClick={() => { setItemToCobrar(membresia); setPosOpen(true); }}>
                                        <Banknote className="h-4 w-4" />
                                    </Button>
                                </Protect>
                                <Protect permission="membresias:actualizar">
                                    <Button variant="ghost" size="icon" className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400" onClick={() => handleEdit(membresia)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                </Protect>
                              </>
                          )}
                          <Protect permission="membresias:eliminar">
                            <Button variant="ghost" size="icon" className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400" onClick={() => handleDelete(membresia.id)}>
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

        <Dialog open={!!detailsMembresia} onOpenChange={(open) => !open && setDetailsMembresia(null)}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Detalles de la Membresía</DialogTitle>
                </DialogHeader>
                {detailsMembresia && (
                    <div className="space-y-6 mt-4">
                        <div className="flex justify-between items-center border-b pb-4">
                            <div>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">Cliente</p>
                                <p className="font-bold text-lg">{detailsMembresia.cliente?.nombre}</p>
                            </div>
                            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${getStateColor(detailsMembresia.estado)}`}>
                                {detailsMembresia.estado}
                            </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">Plan</p>
                                <p className="font-medium">{detailsMembresia.plan?.nombre}</p>
                            </div>
                            <div>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">Fechas</p>
                                <p className="font-medium text-sm">
                                    {formatDateDisplay(detailsMembresia.fechaInicio)} - {detailsMembresia.fechaFin ? formatDateDisplay(detailsMembresia.fechaFin) : 'Ilimitado'}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">Pagada en caja</p>
                                <p className="font-medium">{detailsMembresia.pagada ? 'Sí' : 'No'}</p>
                            </div>
                            <div>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">Sesiones Restantes</p>
                                <p className="font-medium">{detailsMembresia.sesionesRestantes !== null ? detailsMembresia.sesionesRestantes : 'N/A'}</p>
                            </div>
                        </div>

                        <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-lg border">
                            <p className="text-sm font-semibold mb-2 text-zinc-800 dark:text-zinc-100">Desglose Financiero (Histórico)</p>
                            <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-zinc-500 dark:text-zinc-400">Monto Base:</span>
                                    <span>${Number(detailsMembresia.montoBase).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-zinc-500 dark:text-zinc-400">Promoción Aplicada:</span>
                                    <span>{detailsMembresia.promocion?.nombre || 'Ninguna'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-zinc-500 dark:text-zinc-400">Descuento:</span>
                                    <span className="text-emerald-600 dark:text-emerald-400">-${Number(detailsMembresia.descuentoAplicado).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-bold pt-2 border-t mt-2">
                                    <span>Cobro Total:</span>
                                    <span>${Number(detailsMembresia.montoFinal).toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>

        <POSModal 
            open={posOpen}
            onOpenChange={setPosOpen}
            item={itemToCobrar}
        />
      </div>
    </Protect>
  );
}
