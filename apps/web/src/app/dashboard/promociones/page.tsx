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
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { GlobalFormModal } from '@/components/ui/global-form-modal';
import { Protect } from '@/components/ui/protect';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tag, Plus, Edit, Trash2, Calendar, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const promocionSchema = z.object({
  nombre: z.string({ message: "El nombre es obligatorio" }).min(3, "Mínimo 3 caracteres"),
  tipoDescuento: z.enum(['PORCENTAJE', 'FIJO']),
  porcentajeDescuento: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  montoDescuentoFijo: z.coerce.number().min(0).optional().or(z.literal('')),
  fechaInicio: z.string().min(1, "Fecha de inicio es obligatoria"),
  fechaFin: z.string().min(1, "Fecha fin es obligatoria"),
  estado: z.string().default('ACTIVO'),
}).refine(data => {
  if (data.tipoDescuento === 'PORCENTAJE') {
    return data.porcentajeDescuento !== '' && data.porcentajeDescuento !== undefined;
  }
  if (data.tipoDescuento === 'FIJO') {
    return data.montoDescuentoFijo !== '' && data.montoDescuentoFijo !== undefined;
  }
  return true;
}, {
  message: "Debes especificar el valor del descuento",
  path: ["tipoDescuento"]
});

type PromocionFormValues = z.infer<typeof promocionSchema>;

export default function PromocionesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPromocion, setEditingPromocion] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { activeTenantId } = useTenantStore();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    description: '',
    onConfirm: () => {},
    isDestructive: false
  });

  const form = useForm<PromocionFormValues>({
    resolver: zodResolver(promocionSchema) as any,
    mode: 'onChange',
    defaultValues: {
      nombre: '',
      tipoDescuento: 'PORCENTAJE',
      porcentajeDescuento: '',
      montoDescuentoFijo: '',
      fechaInicio: '',
      fechaFin: '',
      estado: 'ACTIVO',
    },
  });

  const watchTipoDescuento = form.watch('tipoDescuento');

  const { data: promociones, isLoading } = useQuery({
    queryKey: ['promociones', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/promociones')),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: async (values: PromocionFormValues) => {
      const payload: any = { ...values };
      // Limpiar el tipo de descuento que NO se eligió
      if (payload.tipoDescuento === 'PORCENTAJE') {
          payload.montoDescuentoFijo = null;
      } else {
          payload.porcentajeDescuento = null;
      }
      // Convertir fechas a ISO completo
      payload.fechaInicio = new Date(payload.fechaInicio).toISOString();
      payload.fechaFin = new Date(payload.fechaFin).toISOString();

      delete payload.tipoDescuento;

      return apiPost('/promociones', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promociones'] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: 'Éxito', description: 'Promoción creada correctamente.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string, values: PromocionFormValues }) => {
      const payload: any = { ...data.values };

      if (payload.tipoDescuento === 'PORCENTAJE') {
          payload.montoDescuentoFijo = null;
      } else {
          payload.porcentajeDescuento = null;
      }
      payload.fechaInicio = new Date(payload.fechaInicio).toISOString();
      payload.fechaFin = new Date(payload.fechaFin).toISOString();

      delete payload.tipoDescuento;

      return apiPatch(`/promociones/${data.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promociones'] });
      setIsDialogOpen(false);
      setEditingPromocion(null);
      form.reset();
      toast({ title: 'Éxito', description: 'Promoción actualizada correctamente.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const { deleteItem } = useSoftDelete({
    queryKey: ['promociones'],
    endpoint: 'promociones',
    itemName: 'La promoción'
  });

  const onSubmit = (values: PromocionFormValues) => {
    if (editingPromocion) {
      updateMutation.mutate({ id: editingPromocion.id, values });
    } else {
      createMutation.mutate(values);
    }
  };

  const formatDateForInput = (isoString: string) => {
      if (!isoString) return '';
      // YYYY-MM-DD
      return new Date(isoString).toISOString().split('T')[0];
  };

  const formatDateDisplay = (isoString: string) => {
      if (!isoString) return '';
      return new Date(isoString).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const handleEdit = (promocion: any) => {
    setEditingPromocion(promocion);
    const tipo = promocion.porcentajeDescuento !== null ? 'PORCENTAJE' : 'FIJO';
    form.reset({
      nombre: promocion.nombre,
      tipoDescuento: tipo,
      porcentajeDescuento: promocion.porcentajeDescuento || '',
      montoDescuentoFijo: promocion.montoDescuentoFijo || '',
      fechaInicio: formatDateForInput(promocion.fechaInicio),
      fechaFin: formatDateForInput(promocion.fechaFin),
      estado: promocion.estado || 'ACTIVO',
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingPromocion(null);
    form.reset({
      nombre: '',
      tipoDescuento: 'PORCENTAJE',
      porcentajeDescuento: '',
      montoDescuentoFijo: '',
      fechaInicio: '',
      fechaFin: '',
      estado: 'ACTIVO',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setConfirmConfig({
      title: '¿Eliminar promoción?',
      description: 'Esta acción desactivará la promoción. Los clientes que ya la aplicaron no se verán afectados.',
      isDestructive: true,
      onConfirm: () => deleteItem(id),
    });
    setConfirmOpen(true);
  };

  if (!token) return null;

  const filteredPromociones = (promociones || []).filter((promocion: any) => {
    if (!searchTerm) return true;
    return promocion.nombre?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const formSections: any[] = [
    {
      title: 'Información Base',
      fields: [
        { name: 'nombre', label: 'Nombre de la Campaña', type: 'text', placeholder: 'Ej. Summer Sale 2026', colSpan: 2 },
        { name: 'fechaInicio', label: 'Fecha de Inicio', type: 'custom', renderCustom: (f: any) => <div className="space-y-2"><label className="text-sm font-medium">Fecha Inicio</label><input type="date" {...f.register('fechaInicio')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" /></div> },
        { name: 'fechaFin', label: 'Fecha de Fin', type: 'custom', renderCustom: (f: any) => <div className="space-y-2"><label className="text-sm font-medium">Fecha Fin</label><input type="date" {...f.register('fechaFin')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" /></div> },
      ]
    },
    {
      title: 'Configuración del Descuento',
      fields: [
        { name: 'tipoDescuento', label: 'Tipo de Descuento', type: 'select', options: [{ label: 'Porcentaje (%)', value: 'PORCENTAJE' }, { label: 'Monto Fijo ($)', value: 'FIJO' }], colSpan: 2 },
      ]
    }
  ];

  if (watchTipoDescuento === 'PORCENTAJE') {
      formSections[1].fields.push({ name: 'porcentajeDescuento', label: 'Porcentaje (%)', type: 'number', placeholder: 'Ej. 15', colSpan: 2 });
  } else {
      formSections[1].fields.push({ name: 'montoDescuentoFijo', label: 'Monto Fijo ($)', type: 'number', placeholder: 'Ej. 50.00', colSpan: 2 });
  }

  formSections.push({
      fields: [
          { name: 'estado', label: 'Estado', type: 'select', options: [{ label: 'Activo', value: 'ACTIVO' }, { label: 'Inactivo', value: 'INACTIVO' }], colSpan: 2 },
      ]
  })

  return (
    <Protect permission="promociones:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Promociones y Ofertas</h2>
            <p className="text-sm text-slate-500 mt-1">Administra los descuentos temporales para atraer más clientes.</p>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar promoción..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-xs"
              />
            </div>
            <Protect permission="promociones:crear">
              <TenantRequiredButton 
                onClick={handleAddNew} 
                icon={<Plus className="mr-2 h-4 w-4" />}
                label="Nueva Promoción"
              />
            </Protect>
          </div>
        </div>

        <GlobalFormModal
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          title={editingPromocion ? 'Editar Promoción' : 'Nueva Promoción'}
          description={editingPromocion ? 'Ajusta los detalles de la oferta.' : 'Crea una nueva campaña de descuentos.'}
          form={form}
          sections={formSections}
          onSubmit={onSubmit}
          isPending={createMutation.isPending || updateMutation.isPending}
          submitLabel="Guardar Promoción"
          maxWidthClass="sm:max-w-[500px]"
        />

        {isLoading ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-8 flex justify-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-8 w-8 bg-slate-200 rounded-full"></div>
              <div className="h-4 w-32 bg-slate-200 rounded"></div>
            </div>
          </div>
        ) : filteredPromociones.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
              <Tag className="w-6 h-6" />
            </div>
            <p className="text-base font-semibold text-slate-900">
              {searchTerm ? 'Ninguna promoción coincide con la búsqueda' : 'No hay promociones registradas'}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              {searchTerm ? 'Prueba con otro nombre.' : 'Crea tu primera promoción para atraer clientes.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaña</TableHead>
                <TableHead>Descuento</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPromociones.map((promocion: any) => {
                const isActive = promocion.estado === 'ACTIVO' && new Date(promocion.fechaFin) >= new Date();
                
                return (
                  <TableRow key={promocion.id} className={!isActive ? 'opacity-70' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                          <Tag className="h-4 w-4" />
                        </div>
                        <p className="font-semibold text-slate-900 text-sm">{promocion.nombre}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-bold text-slate-900 text-lg">
                        {promocion.porcentajeDescuento ? `-${Number(promocion.porcentajeDescuento)}%` : `-$${Number(promocion.montoDescuentoFijo).toFixed(2)}`}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-xs text-slate-600">
                        <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-slate-400"/> Del: {formatDateDisplay(promocion.fechaInicio)}</span>
                        <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-slate-400"/> Al: {formatDateDisplay(promocion.fechaFin)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {isActive ? <Badge variant="success">Activa</Badge> : <Badge variant="default">Inactiva/Expirada</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Protect permission="promociones:actualizar">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(promocion)} className="text-slate-500 hover:text-indigo-600">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </Protect>
                        <Protect permission="promociones:eliminar">
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(promocion.id)} className="text-slate-500 hover:text-rose-600">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </Protect>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
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
