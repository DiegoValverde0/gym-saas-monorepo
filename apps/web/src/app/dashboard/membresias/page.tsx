"use client";

import { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, unwrapList } from '@/lib/api-client';
import { useForm, useWatch } from 'react-hook-form';
import { useSoftDelete } from '@/hooks/use-soft-delete';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { GlobalFormModal } from '@/components/ui/global-form-modal';
import { Protect } from '@/components/ui/protect';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { IdCard, Plus, Trash2, Clock, CalendarDays, CheckCircle2, Search, Info, Edit, Eye, Banknote } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { POSModal } from './POSModal';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const membresiaSchema = z.object({
  clienteId: z.string().min(1, "Selecciona un cliente"),
  sucursalId: z.string().optional(),
  planId: z.string().min(1, "Selecciona un plan"),
  promocionId: z.string().optional().or(z.literal('')),
  fechaInicio: z.string().min(1, "Fecha obligatoria"),
});

type MembresiaFormValues = z.infer<typeof membresiaSchema>;

export default function MembresiasPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token, user } = useAuth();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
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

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 200);

  // Búsqueda del directorio de membresías (distinta del buscador de cliente
  // dentro del formulario de venta, que usa `searchTerm` de arriba).
  const [directorySearch, setDirectorySearch] = useState('');

  const form = useForm<MembresiaFormValues>({
    resolver: zodResolver(membresiaSchema),
    mode: 'onChange',
    defaultValues: {
      clienteId: '',
      planId: '',
      promocionId: '',
      fechaInicio: new Date().toISOString().split('T')[0],
    },
  });

  const watchClienteId = useWatch({ control: form.control, name: 'clienteId' });
  const watchPlanId = useWatch({ control: form.control, name: 'planId' });
  const watchPromoId = useWatch({ control: form.control, name: 'promocionId' });

  // Consultas
  const { data: membresias, isLoading } = useQuery({
    queryKey: ['membresias', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/membresias')),
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

  // Autocompletar sucursalId si el usuario es global
  useEffect(() => {
    if (userSucursalId === null || userSucursalId === undefined) {
      if (watchClienteId && clientes) {
        const clList = unwrapList(clientes);
        const client = clList.find((c: any) => c.id === watchClienteId);
        if (client && client.sucursalBaseId) {
          form.setValue('sucursalId', client.sucursalBaseId);
        } else {
          form.setValue('sucursalId', '');
        }
      }
    }
  }, [watchClienteId, clientes, userSucursalId, form]);

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
      form.reset();
      toast({ title: 'Éxito', description: 'Membresía creada (Pendiente de Pago).', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  // Para actualizar la membresía PENDIENTE_PAGO si el usuario la edita antes de pagar.
  // Notar que el backend actualmente tiene el update(), pero la re-evaluacion de precios/encolamiento no está en el PATCH en el servicio, sino en el POST.
  // La mejor práctica para "editar" una venta pendiente es CANCELARLA y CREAR UNA NUEVA, pero para UX lo simularemos como un POST si la estamos re-haciendo, 
  // o si el backend soporte update completo, usamos update. 
  // Dado que el POST anula las anteriores pendientes, simplemente usar POST funciona perfecto como un "Update destructivo".
  const onSubmit = (values: MembresiaFormValues) => {
    // Si estamos editando, simplemente creamos una nueva, el backend anulará automáticamente la PENDIENTE_PAGO anterior!
    createMutation.mutate(values);
  };

  const { deleteItem } = useSoftDelete({
    queryKey: ['membresias'],
    endpoint: 'membresias',
    itemName: 'La membresía'
  });

  const handleAddNew = () => {
    setEditingMembresia(null);
    setSearchTerm('');
    form.reset({
      clienteId: '',
      sucursalId: userSucursalId || '',
      planId: '',
      promocionId: '',
      fechaInicio: new Date().toISOString().split('T')[0],
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (membresia: any) => {
    setEditingMembresia(membresia);
    setSearchTerm('');
    form.reset({
      clienteId: membresia.clienteId,
      sucursalId: membresia.sucursalId || userSucursalId || '',
      planId: membresia.planId,
      promocionId: membresia.promocionId || '',
      fechaInicio: new Date(membresia.fechaInicio).toISOString().split('T')[0],
    });
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

  // Logica de calculo preview
  const selectedPlan = useMemo(() => {
    if (!planes) return null;
    return planes.find((p: any) => p.id === watchPlanId);
  }, [watchPlanId, planes]);

  const selectedPromo = useMemo(() => {
    if (!promociones) return null;
    return promociones.find((p: any) => p.id === watchPromoId);
  }, [watchPromoId, promociones]);

  // Alertas de cliente
  const membresiaAlertas = useMemo(() => {
    if (!membresias || !watchClienteId) return null;
    const mems = membresias;

    // Buscar si tiene congeladas
    const congelada = mems.find((m: any) => m.clienteId === watchClienteId && m.estado === 'CONGELADA');
    if (congelada) {
        return {
            type: 'congelada',
            title: 'Cliente con membresía CONGELADA',
            desc: `Este cliente tiene una membresía congelada. Antes de venderle una nueva, sugiera descongelar la actual o asegúrese de que el cliente entienda que la nueva membresía se encolará.`,
            color: 'bg-blue-50 text-blue-800 border-blue-200'
        }
    }

    // Buscar si tiene activas
    const activa = mems.find((m: any) => m.clienteId === watchClienteId && m.estado === 'ACTIVA');
    if (activa) {
        return {
            type: 'activa',
            title: 'Membresía Activa Detectada',
            desc: `El cliente ya tiene acceso vigente hasta el ${new Date(activa.fechaFin).toLocaleDateString()}. Esta nueva compra se ENCOLARÁ automáticamente y comenzará cuando la actual caduque.`,
            color: 'bg-emerald-50 text-emerald-800 border-emerald-200'
        }
    }

    // Buscar si tiene en espera
    const enEspera = mems.find((m: any) => m.clienteId === watchClienteId && m.estado === 'EN_ESPERA');
    if (enEspera) {
        return {
            type: 'espera',
            title: 'Membresía en Espera Detectada',
            desc: `El cliente ya tiene un paquete comprado esperando iniciar. Venderle otro más lo empujará aún más al futuro.`,
            color: 'bg-purple-50 text-purple-800 border-purple-200'
        }
    }

    return null;
  }, [watchClienteId, membresias]);

  const previewMontoBase = selectedPlan ? Number(selectedPlan.precio) : 0;
  let previewDescuento = 0;
  
  if (selectedPlan && selectedPromo) {
      if (selectedPromo.porcentajeDescuento) {
          previewDescuento = (previewMontoBase * Number(selectedPromo.porcentajeDescuento)) / 100;
      } else if (selectedPromo.montoDescuentoFijo) {
          previewDescuento = Number(selectedPromo.montoDescuentoFijo);
      }
  }

  let previewMontoFinal = previewMontoBase - previewDescuento;
  if (previewMontoFinal < 0) previewMontoFinal = 0;

  const clientesList = clientes || [];
  const planesList = planes || [];
  const promocionesList = promociones || [];
  const membresiasList = membresias || [];
  const filteredMembresias = membresiasList.filter((m: any) => {
    if (!directorySearch) return true;
    const lower = directorySearch.toLowerCase();
    return m.cliente?.nombre?.toLowerCase().includes(lower) || m.plan?.nombre?.toLowerCase().includes(lower);
  });

  const filteredClientes = useMemo(() => {
    if (!debouncedSearch) return clientesList.slice(0, 50); // mostrar max 50 para no trabar
    const lower = debouncedSearch.toLowerCase();
    return clientesList.filter((c: any) => 
        c.nombre.toLowerCase().includes(lower) || 
        (c.numeroDocumento && c.numeroDocumento.includes(lower))
    ).slice(0, 50);
  }, [debouncedSearch, clientesList]);

  if (!token) return null;

  const formSections: any[] = [
    {
      title: 'Datos de la Venta',
      fields: [
        {
            name: 'clienteId',
            label: 'Buscar Cliente (Nombre o Documento)',
            type: 'custom',
            colSpan: 2,
            renderCustom: (f: any) => (
                <div className="space-y-3">
                    <label className={`text-sm font-medium ${f.formState.errors.clienteId ? 'text-red-500' : ''}`}>Seleccionar Cliente</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                        <Input 
                            placeholder="Ej. Juan o 12345..." 
                            className="pl-9 bg-white"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="max-h-40 overflow-y-auto border rounded-md bg-white divide-y">
                        {filteredClientes.length === 0 && (
                            <div className="p-3 text-sm text-zinc-500 text-center">No se encontraron clientes</div>
                        )}
                        {filteredClientes.map((c: any) => (
                            <div 
                                key={c.id} 
                                onClick={() => f.setValue('clienteId', c.id, { shouldValidate: true })}
                                className={`p-2 cursor-pointer hover:bg-indigo-50 transition-colors flex justify-between items-center text-sm ${watchClienteId === c.id ? 'bg-indigo-50 border-l-2 border-indigo-600' : ''}`}
                            >
                                <div>
                                    <p className="font-medium">{c.nombre}</p>
                                    <p className="text-xs text-zinc-500">{c.numeroDocumento || 'Sin doc'}</p>
                                </div>
                                {watchClienteId === c.id && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}
                            </div>
                        ))}
                    </div>
                    {f.formState.errors.clienteId && <p className="text-sm text-red-500">{f.formState.errors.clienteId.message}</p>}

                    {membresiaAlertas && (
                        <div className={`p-3 rounded-md border text-sm flex gap-3 ${membresiaAlertas.color} mt-2 animate-in fade-in`}>
                            <Info className="w-5 h-5 shrink-0" />
                            <div>
                                <p className="font-bold">{membresiaAlertas.title}</p>
                                <p className="mt-0.5 leading-relaxed">{membresiaAlertas.desc}</p>
                            </div>
                        </div>
                    )}
                </div>
            )
        },
        (!userSucursalId ? {
            name: 'sucursalId',
            label: 'Sucursal de la Membresía',
            type: 'select',
            options: (sucursales || []).map((s: any) => ({ label: s.nombre, value: s.id }))
        } : null),
        { name: 'planId', label: 'Plan', type: 'select', options: planesList.filter((p:any) => p.estado === 'ACTIVO').map((p: any) => ({ label: `${p.nombre} - $${p.precio}`, value: p.id })) },
        { name: 'promocionId', label: 'Promoción Aplicable', type: 'select', options: [{ label: 'Ninguna', value: '' }, ...promocionesList.filter((p:any) => p.estado === 'ACTIVO').map((p: any) => ({ label: p.nombre, value: p.id }))] },
        { name: 'fechaInicio', label: 'Fecha de Inicio Deseada', type: 'custom', colSpan: 2, renderCustom: (f: any) => <div className="space-y-2"><label className="text-sm font-medium">Fecha de Inicio</label><input type="date" {...f.register('fechaInicio')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" /><p className="text-xs text-zinc-500">Si el cliente tiene otra membresía activa, esta fecha se ignorará y la membresía se encolará automáticamente.</p></div> },
        {
            name: 'preview',
            label: 'Resumen Financiero',
            type: 'custom',
            colSpan: 2,
            renderCustom: () => (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mt-2 shadow-inner">
                    <h4 className="font-semibold text-indigo-900 mb-2">Total a Cobrar</h4>
                    <div className="flex justify-between text-sm text-indigo-700">
                        <span>Monto Base:</span>
                        <span>${previewMontoBase.toFixed(2)}</span>
                    </div>
                    {previewDescuento > 0 && (
                        <div className="flex justify-between text-sm text-emerald-600 font-medium">
                            <span>Descuento:</span>
                            <span>-${previewDescuento.toFixed(2)}</span>
                        </div>
                    )}
                    <div className="flex justify-between font-bold text-lg text-indigo-900 mt-2 pt-2 border-t border-indigo-200">
                        <span>Total a pagar en caja:</span>
                        <span>${previewMontoFinal.toFixed(2)}</span>
                    </div>
                </div>
            )
        }
      ].filter(Boolean)
    },
  ];

  const getStateColor = (estado: string) => {
    switch (estado) {
        case 'PENDIENTE_PAGO': return 'bg-amber-100 text-amber-800 border-amber-200';
        case 'EN_ESPERA': return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'ACTIVA': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
        case 'VENCIDA': return 'bg-red-100 text-red-800 border-red-200';
        case 'CONGELADA': return 'bg-zinc-100 text-zinc-800 border-zinc-300';
        case 'CANCELADA': return 'bg-zinc-100 text-zinc-800 border-zinc-200 line-through';
        default: return 'bg-zinc-100 text-zinc-800 border-zinc-200';
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
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Membresías</h2>
            <p className="text-sm text-slate-500 mt-1">Registra y administra los accesos de tus clientes.</p>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar membresía..."
                value={directorySearch}
                onChange={(e) => setDirectorySearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-xs"
              />
            </div>
            <Protect permission="membresias:crear">
              <TenantRequiredButton 
                onClick={handleAddNew} 
                icon={<Plus className="mr-2 h-4 w-4" />}
                label="Nueva Venta"
              />
            </Protect>
          </div>
        </div>

        <GlobalFormModal
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          title={editingMembresia ? 'Editar Venta' : 'Asignar Nueva Membresía'}
          description={editingMembresia ? 'Corrige la venta. Se reemplazará la membresía pendiente actual por esta nueva configuración.' : 'Configura el plan para el cliente. La membresía nacerá como Pendiente de Pago hasta que se registre en caja.'}
          form={form}
          sections={formSections}
          onSubmit={onSubmit}
          isPending={createMutation.isPending}
          submitLabel="Crear y Generar Cobro"
          maxWidthClass="sm:max-w-[650px]"
        />

        {isLoading ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-8 flex justify-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-8 w-8 bg-slate-200 rounded-full"></div>
              <div className="h-4 w-32 bg-slate-200 rounded"></div>
            </div>
          </div>
        ) : filteredMembresias.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
              <IdCard className="w-6 h-6" />
            </div>
            <p className="text-base font-semibold text-slate-900">
              {directorySearch ? 'Ninguna membresía coincide con la búsqueda' : 'No hay membresías vendidas'}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              {directorySearch ? 'Prueba con otro cliente o plan.' : 'Registra la primera venta para comenzar.'}
            </p>
          </div>
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
                <TableRow key={membresia.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs shrink-0">
                        {membresia.cliente?.nombre?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm truncate max-w-[200px]">{membresia.cliente?.nombre}</p>
                        <p className="text-xs text-indigo-600 font-medium truncate max-w-[200px]">{membresia.plan?.nombre}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-bold text-slate-900">${Number(membresia.montoFinal).toFixed(2)}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-xs text-slate-600">
                      <span className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-slate-400"/> {formatDateDisplay(membresia.fechaInicio)}</span>
                      {membresia.fechaFin ? (
                        <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-slate-400"/> Vence: {formatDateDisplay(membresia.fechaFin)}</span>
                      ) : (
                        <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-slate-400"/> Ilimitado</span>
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
                      <Button variant="ghost" size="icon" className="text-slate-500 hover:text-indigo-600" onClick={() => setDetailsMembresia(membresia)}>
                          <Eye className="h-4 w-4" />
                      </Button>
                      {membresia.estado === 'PENDIENTE_PAGO' && (
                          <>
                            <Protect permission="transacciones:crear">
                                <Button variant="ghost" size="icon" className="text-emerald-600 hover:bg-emerald-50" onClick={() => { setItemToCobrar(membresia); setPosOpen(true); }}>
                                    <Banknote className="h-4 w-4" />
                                </Button>
                            </Protect>
                            <Protect permission="membresias:actualizar">
                                <Button variant="ghost" size="icon" className="text-slate-500 hover:text-indigo-600" onClick={() => handleEdit(membresia)}>
                                    <Edit className="h-4 w-4" />
                                </Button>
                            </Protect>
                          </>
                      )}
                      <Protect permission="membresias:eliminar">
                        <Button variant="ghost" size="icon" className="text-slate-500 hover:text-rose-600" onClick={() => handleDelete(membresia.id)}>
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

        <Dialog open={!!detailsMembresia} onOpenChange={(open) => !open && setDetailsMembresia(null)}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Detalles de la Membresía</DialogTitle>
                </DialogHeader>
                {detailsMembresia && (
                    <div className="space-y-6 mt-4">
                        <div className="flex justify-between items-center border-b pb-4">
                            <div>
                                <p className="text-sm text-zinc-500">Cliente</p>
                                <p className="font-bold text-lg">{detailsMembresia.cliente?.nombre}</p>
                            </div>
                            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${getStateColor(detailsMembresia.estado)}`}>
                                {detailsMembresia.estado}
                            </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-zinc-500">Plan</p>
                                <p className="font-medium">{detailsMembresia.plan?.nombre}</p>
                            </div>
                            <div>
                                <p className="text-sm text-zinc-500">Fechas</p>
                                <p className="font-medium text-sm">
                                    {formatDateDisplay(detailsMembresia.fechaInicio)} - {detailsMembresia.fechaFin ? formatDateDisplay(detailsMembresia.fechaFin) : 'Ilimitado'}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-zinc-500">Pagada en caja</p>
                                <p className="font-medium">{detailsMembresia.pagada ? 'Sí' : 'No'}</p>
                            </div>
                            <div>
                                <p className="text-sm text-zinc-500">Sesiones Restantes</p>
                                <p className="font-medium">{detailsMembresia.sesionesRestantes !== null ? detailsMembresia.sesionesRestantes : 'N/A'}</p>
                            </div>
                        </div>

                        <div className="bg-zinc-50 p-4 rounded-lg border">
                            <p className="text-sm font-semibold mb-2 text-zinc-800">Desglose Financiero (Histórico)</p>
                            <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">Monto Base:</span>
                                    <span>${Number(detailsMembresia.montoBase).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">Promoción Aplicada:</span>
                                    <span>{detailsMembresia.promocion?.nombre || 'Ninguna'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">Descuento:</span>
                                    <span className="text-emerald-600">-${Number(detailsMembresia.descuentoAplicado).toFixed(2)}</span>
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
