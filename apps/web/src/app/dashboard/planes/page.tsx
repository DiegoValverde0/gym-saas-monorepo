"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, apiPatch, unwrapList } from '@/lib/api-client';
import { useForm, Controller } from 'react-hook-form';
import { useSoftDelete } from '@/hooks/use-soft-delete';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { PlanWizardModal } from '@/components/ui/plan-wizard-modal';
import { Protect } from '@/components/ui/protect';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Briefcase, Plus, Edit, Trash2, Clock, CalendarDays, Search, ArchiveRestore } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PapeleraToggle } from '@/components/ui/papelera-toggle';

export default function PlanesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any | null>(null);
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

  const { data: planes, isLoading } = useQuery({
    queryKey: ['planes', activeTenantId, showDeleted],
    queryFn: async () => unwrapList(await apiGet(showDeleted ? '/planes?deleted=true' : '/planes')),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: async (values: any) => {
      const payload: any = { ...values };
      if (!payload.duracionDias) delete payload.duracionDias;
      if (!payload.cantidadSesiones) delete payload.cantidadSesiones;
      if (!payload.limiteDiasSemana) delete payload.limiteDiasSemana;
      if (!payload.horaInicioAcceso) delete payload.horaInicioAcceso;
      if (!payload.horaFinAcceso) delete payload.horaFinAcceso;

      return apiPost('/planes', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planes'] });
      setIsDialogOpen(false);
      toast({ title: 'Éxito', description: 'Plan creado correctamente.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string, values: any }) => {
      const payload: any = { ...data.values };
      if (!payload.duracionDias) payload.duracionDias = null;
      if (!payload.cantidadSesiones) payload.cantidadSesiones = null;
      if (!payload.limiteDiasSemana) payload.limiteDiasSemana = null;
      if (!payload.horaInicioAcceso) payload.horaInicioAcceso = null;
      if (!payload.horaFinAcceso) payload.horaFinAcceso = null;

      return apiPatch(`/planes/${data.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planes'] });
      setIsDialogOpen(false);
      setEditingPlan(null);
      toast({ title: 'Éxito', description: 'Plan actualizado correctamente.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const { deleteItem, restoreItem, isRestoring } = useSoftDelete({
    queryKey: ['planes', activeTenantId, showDeleted],
    endpoint: 'planes',
    modelName: 'plan',
    itemName: 'El plan'
  });

  const onSubmit = (values: any) => {
    if (editingPlan) {
      updateMutation.mutate({ id: editingPlan.id, values });
    } else {
      createMutation.mutate(values);
    }
  };

  const parseTime = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toISOString().substring(11, 16);
  };

  const handleEdit = (plan: any) => {
    setEditingPlan(plan);
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingPlan(null);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setConfirmConfig({
      title: '¿Eliminar plan?',
      description: 'Esta acción desactivará el plan. Las membresías actuales no se verán afectadas, pero no se podrán crear nuevas.',
      isDestructive: true,
      onConfirm: () => deleteItem(id),
    });
    setConfirmOpen(true);
  };

  if (!token) return null;

  const filteredPlanes = (planes || []).filter((plan: any) => {
    if (!searchTerm) return true;
    return plan.nombre?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <Protect permission="planes:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Planes de Gimnasio</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Configura las membresías y reglas de acceso.</p>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Buscar plan..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 shadow-xs"
              />
            </div>
            <PapeleraToggle showDeleted={showDeleted} setShowDeleted={setShowDeleted} />
            <Protect permission="planes:crear">
              <TenantRequiredButton 
                onClick={handleAddNew} 
                icon={<Plus className="mr-2 h-4 w-4" />}
                label="Nuevo Plan"
              />
            </Protect>
          </div>
        </div>

        <PlanWizardModal
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          onSubmit={onSubmit as any}
          initialData={editingPlan}
          isPending={createMutation.isPending || updateMutation.isPending}
        />

        {isLoading ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-8 flex justify-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
              <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded"></div>
            </div>
          </div>
        ) : filteredPlanes.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-full flex items-center justify-center mb-4">
              <Briefcase className="w-6 h-6" />
            </div>
            <p className="text-base font-semibold text-slate-900 dark:text-white">
              {searchTerm ? 'Ningún plan coincide con la búsqueda' : 'No hay planes registrados'}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {searchTerm ? 'Prueba con otro nombre.' : 'Crea tu primer plan para comenzar a vender membresías.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Tipo y Duración</TableHead>
                <TableHead>Restricciones</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPlanes.map((plan: any) => (
                <TableRow key={plan.id} className={showDeleted ? "bg-rose-50/40 dark:bg-rose-500/20 opacity-80" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-700 dark:text-indigo-300 shrink-0">
                        <Briefcase className="h-4 w-4" />
                      </div>
                      <p className="font-semibold text-slate-900 dark:text-white text-sm">{plan.nombre}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-bold text-slate-900 dark:text-white">${Number(plan.precio).toFixed(2)}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <Badge variant="primary" className="font-medium bg-indigo-50 dark:bg-indigo-500/20">{plan.tipoPlan}</Badge>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {plan.tipoPlan === 'TIEMPO' && `${plan.duracionDias} días`}
                        {plan.tipoPlan === 'SESIONES' && `${plan.cantidadSesiones} sesiones`}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                      {(plan.horaInicioAcceso || plan.horaFinAcceso) ? (
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5"/> {plan.horaInicioAcceso ? parseTime(plan.horaInicioAcceso) : '00:00'} - {plan.horaFinAcceso ? parseTime(plan.horaFinAcceso) : '23:59'}</span>
                      ) : (
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5"/> 24/7</span>
                      )}
                      {plan.diasPermitidos && plan.diasPermitidos.length > 0 ? (
                        <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5"/> {plan.diasPermitidos.length} días permitidos</span>
                      ) : (
                        <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5"/> Todos los días</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {plan.estado === 'ACTIVO' ? <Badge variant="success">Activo</Badge> : <Badge variant="default">Inactivo</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {showDeleted ? (
                        <Protect permission="sistema:restaurar">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => restoreItem(plan.id)} 
                            disabled={isRestoring}
                            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 h-8 px-3"
                          >
                            <ArchiveRestore className="h-4 w-4 mr-2" /> Restaurar
                          </Button>
                        </Protect>
                      ) : (
                        <>
                          <Protect permission="planes:actualizar">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(plan)} className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </Protect>
                          <Protect permission="planes:eliminar">
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(plan.id)} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400">
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
