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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { GlobalFormModal } from '@/components/ui/global-form-modal';
import { Protect } from '@/components/ui/protect';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Briefcase, Plus, Edit, Trash2, Clock, CalendarDays, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const planSchema = z.object({
  nombre: z.string({ message: "El nombre es obligatorio" }).min(3, "Mínimo 3 caracteres"),
  tipoPlan: z.enum(['TIEMPO', 'SESIONES', 'VISITA']),
  duracionDias: z.coerce.number().min(1).optional().or(z.literal('')),
  limiteDiasSemana: z.coerce.number().optional().or(z.literal('')),
  diasPermitidos: z.array(z.number()).default([]),
  cantidadSesiones: z.coerce.number().optional().or(z.literal('')),
  horaInicioAcceso: z.string().optional(),
  horaFinAcceso: z.string().optional(),
  esRenovableAutomaticamente: z.boolean().default(false),
  precio: z.coerce.number().min(0, "El precio no puede ser negativo"),
  estado: z.string().default('ACTIVO'),
});

type PlanFormValues = z.infer<typeof planSchema>;

const DAYS_OF_WEEK = [
  { label: 'Lunes', value: 1 },
  { label: 'Martes', value: 2 },
  { label: 'Miércoles', value: 3 },
  { label: 'Jueves', value: 4 },
  { label: 'Viernes', value: 5 },
  { label: 'Sábado', value: 6 },
  { label: 'Domingo', value: 0 },
];

export default function PlanesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any | null>(null);
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

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema) as any,
    mode: 'onChange',
    defaultValues: {
      nombre: '',
      tipoPlan: 'TIEMPO',
      duracionDias: 30,
      cantidadSesiones: '',
      limiteDiasSemana: '',
      diasPermitidos: [],
      horaInicioAcceso: '',
      horaFinAcceso: '',
      esRenovableAutomaticamente: false,
      precio: 0,
      estado: 'ACTIVO',
    },
  });

  const watchTipoPlan = form.watch('tipoPlan');

  const { data: planes, isLoading } = useQuery({
    queryKey: ['planes', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/planes')),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: async (values: PlanFormValues) => {
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
      form.reset();
      toast({ title: 'Éxito', description: 'Plan creado correctamente.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string, values: PlanFormValues }) => {
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
      form.reset();
      toast({ title: 'Éxito', description: 'Plan actualizado correctamente.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const { deleteItem } = useSoftDelete({
    queryKey: ['planes'],
    endpoint: 'planes',
    itemName: 'El plan'
  });

  const onSubmit = (values: PlanFormValues) => {
    if (editingPlan) {
      updateMutation.mutate({ id: editingPlan.id, values });
    } else {
      createMutation.mutate(values);
    }
  };

  const parseTime = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toISOString().substring(11, 16);
  };

  const handleEdit = (plan: any) => {
    setEditingPlan(plan);
    form.reset({
      nombre: plan.nombre,
      tipoPlan: plan.tipoPlan,
      duracionDias: plan.duracionDias || '',
      cantidadSesiones: plan.cantidadSesiones || '',
      limiteDiasSemana: plan.limiteDiasSemana || '',
      diasPermitidos: plan.diasPermitidos || [],
      horaInicioAcceso: parseTime(plan.horaInicioAcceso),
      horaFinAcceso: parseTime(plan.horaFinAcceso),
      esRenovableAutomaticamente: plan.esRenovableAutomaticamente || false,
      precio: Number(plan.precio),
      estado: plan.estado || 'ACTIVO',
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    if (!userOrgId && (!activeTenantId || activeTenantId === 'all')) {
      toast({ title: 'Acción requerida', description: 'Por favor, selecciona una organización en el menú superior antes de crear un plan.', variant: 'destructive' });
      return;
    }
    setEditingPlan(null);
    form.reset({
      nombre: '',
      tipoPlan: 'TIEMPO',
      duracionDias: 30,
      cantidadSesiones: '',
      limiteDiasSemana: '',
      diasPermitidos: [],
      horaInicioAcceso: '',
      horaFinAcceso: '',
      esRenovableAutomaticamente: false,
      precio: 0,
      estado: 'ACTIVO',
    });
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

  const formSections: any[] = [
    {
      title: 'Datos Generales',
      fields: [
        { name: 'nombre', label: 'Nombre del Plan', type: 'text', placeholder: 'Ej. Plan Mensual Ilimitado', colSpan: 2 },
        { name: 'tipoPlan', label: 'Tipo de Plan', type: 'select', options: [{ label: 'Por Tiempo', value: 'TIEMPO' }, { label: 'Por Sesiones', value: 'SESIONES' }, { label: 'Pase de Visita', value: 'VISITA' }] },
        { name: 'precio', label: 'Precio Total', type: 'number', placeholder: '0.00' },
        { name: 'estado', label: 'Estado', type: 'select', options: [{ label: 'Activo', value: 'ACTIVO' }, { label: 'Inactivo', value: 'INACTIVO' }] },
        { name: 'esRenovableAutomaticamente', label: 'Renovación Automática', type: 'switch', description: 'El plan se renovará automáticamente al vencer.' },
      ]
    },
    {
      title: 'Reglas y Restricciones',
      fields: []
    }
  ];

  if (watchTipoPlan === 'TIEMPO') {
    formSections[1].fields.push({ name: 'duracionDias', label: 'Duración (Días)', type: 'number', placeholder: 'Ej. 30' });
  } else if (watchTipoPlan === 'SESIONES') {
    formSections[1].fields.push({ name: 'cantidadSesiones', label: 'Cantidad de Sesiones', type: 'number', placeholder: 'Ej. 12' });
  }

  formSections[1].fields.push(
    { name: 'limiteDiasSemana', label: 'Límite días por semana (Opcional)', type: 'number', placeholder: 'Ej. 3' },
    {
      name: 'horasAcceso',
      label: 'Horario Restringido',
      type: 'custom',
      colSpan: 2,
      renderCustom: (f: any) => (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Hora Inicio (Opcional)</Label>
            <Input type="time" {...f.register('horaInicioAcceso')} className="bg-white" />
          </div>
          <div className="space-y-2">
            <Label>Hora Fin (Opcional)</Label>
            <Input type="time" {...f.register('horaFinAcceso')} className="bg-white" />
          </div>
        </div>
      )
    },
    {
      name: 'diasPermitidos',
      label: 'Días Permitidos (Opcional, vacío = Todos)',
      type: 'custom',
      colSpan: 2,
      renderCustom: (f: any) => (
        <div className="space-y-3">
          <Label className="text-zinc-700">Días de acceso permitido</Label>
          <div className="flex flex-wrap gap-4">
            <Controller
              control={f.control}
              name="diasPermitidos"
              render={({ field }) => (
                <>
                  {DAYS_OF_WEEK.map((day) => {
                    const isChecked = Array.isArray(field.value) && field.value.includes(day.value);
                    return (
                      <div key={day.value} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`day-${day.value}`} 
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              field.onChange([...(field.value || []), day.value]);
                            } else {
                              field.onChange((field.value || []).filter((v: number) => v !== day.value));
                            }
                          }}
                        />
                        <Label htmlFor={`day-${day.value}`} className="cursor-pointer font-normal">{day.label}</Label>
                      </div>
                    )
                  })}
                </>
              )}
            />
          </div>
        </div>
      )
    }
  );

  return (
    <Protect permission="planes:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Planes de Gimnasio</h2>
            <p className="text-sm text-slate-500 mt-1">Configura las membresías y reglas de acceso.</p>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar plan..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-xs"
              />
            </div>
            <Protect permission="planes:crear">
              <TenantRequiredButton 
                onClick={handleAddNew} 
                icon={<Plus className="mr-2 h-4 w-4" />}
                label="Nuevo Plan"
              />
            </Protect>
          </div>
        </div>

        <GlobalFormModal
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          title={editingPlan ? 'Editar Plan' : 'Nuevo Plan'}
          description={editingPlan ? 'Modifica las reglas comerciales del plan.' : 'Agrega una nueva oferta comercial para tus clientes.'}
          form={form}
          sections={formSections}
          onSubmit={onSubmit}
          isPending={createMutation.isPending || updateMutation.isPending}
          submitLabel="Guardar Plan"
          maxWidthClass="sm:max-w-[700px]"
        />

        {isLoading ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-8 flex justify-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-8 w-8 bg-slate-200 rounded-full"></div>
              <div className="h-4 w-32 bg-slate-200 rounded"></div>
            </div>
          </div>
        ) : filteredPlanes.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
              <Briefcase className="w-6 h-6" />
            </div>
            <p className="text-base font-semibold text-slate-900">
              {searchTerm ? 'Ningún plan coincide con la búsqueda' : 'No hay planes registrados'}
            </p>
            <p className="text-sm text-slate-500 mt-1">
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
                <TableRow key={plan.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 shrink-0">
                        <Briefcase className="h-4 w-4" />
                      </div>
                      <p className="font-semibold text-slate-900 text-sm">{plan.nombre}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-bold text-slate-900">${Number(plan.precio).toFixed(2)}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <Badge variant="primary" className="font-medium bg-indigo-50">{plan.tipoPlan}</Badge>
                      <span className="text-xs text-slate-500">
                        {plan.tipoPlan === 'TIEMPO' && `${plan.duracionDias} días`}
                        {plan.tipoPlan === 'SESIONES' && `${plan.cantidadSesiones} sesiones`}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-xs text-slate-500">
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
                      <Protect permission="planes:actualizar">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(plan)} className="text-slate-500 hover:text-indigo-600">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </Protect>
                      <Protect permission="planes:eliminar">
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(plan.id)} className="text-slate-500 hover:text-rose-600">
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
