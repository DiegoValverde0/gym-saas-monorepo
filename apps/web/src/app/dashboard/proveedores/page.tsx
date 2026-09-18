"use client";

import { useState } from 'react';
import { Protect } from '@/components/ui/protect';
import { GlobalFormModal } from '@/components/ui/global-form-modal';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Truck, Trash2, Search, ArchiveRestore } from 'lucide-react';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, apiPatch, unwrapList } from '@/lib/api-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useSoftDelete } from '@/hooks/use-soft-delete';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { PapeleraToggle } from '@/components/ui/papelera-toggle';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const CATEGORIAS_GASTO = [
  { label: 'Sin categoría por defecto', value: '' },
  { label: 'Alquiler', value: 'ALQUILER' },
  { label: 'Servicios Básicos', value: 'SERVICIOS_BASICOS' },
  { label: 'Nómina', value: 'NOMINA' },
  { label: 'Insumos', value: 'INSUMOS' },
  { label: 'Mantenimiento', value: 'MANTENIMIENTO' },
  { label: 'Impuestos', value: 'IMPUESTOS' },
  { label: 'Otro Gasto', value: 'OTRO_GASTO' },
];

const proveedorSchema = z.object({
  nombre: z.string().min(2, 'Obligatorio'),
  numeroDocumento: z.string().optional(),
  telefono: z.string().optional(),
  correo: z.string().email('Correo inválido').optional().or(z.literal('')),
  categoriaDefault: z.string().optional(),
  estado: z.string().optional(),
});

type ProveedorFormValues = z.infer<typeof proveedorSchema>;

interface Proveedor {
  id: string;
  nombre: string;
  numeroDocumento?: string | null;
  telefono?: string | null;
  correo?: string | null;
  categoriaDefault?: string | null;
  estado: string;
}

export default function ProveedoresPage() {
  const { activeTenantId } = useTenantStore();
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditingData] = useState<Proveedor | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Proveedor | null>(null);

  const form = useForm<ProveedorFormValues>({
    resolver: zodResolver(proveedorSchema),
    defaultValues: { nombre: '', numeroDocumento: '', telefono: '', correo: '', categoriaDefault: '', estado: 'ACTIVO' },
  });

  const { data: proveedores, isLoading } = useQuery({
    queryKey: ['proveedores', activeTenantId, showDeleted],
    queryFn: async () => unwrapList(await apiGet(showDeleted ? '/proveedores?deleted=true' : '/proveedores')),
    enabled: !!token,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: ProveedorFormValues) => {
      const payload: Partial<ProveedorFormValues> = { ...values };
      if (!payload.correo) delete payload.correo;
      if (!payload.categoriaDefault) delete payload.categoriaDefault;
      return editingData ? apiPatch(`/proveedores/${editingData.id}`, payload) : apiPost('/proveedores', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      setModalOpen(false);
      setEditingData(null);
      form.reset();
      toast({ title: 'Éxito', description: 'Proveedor guardado correctamente.', variant: 'success' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const { deleteItem, restoreItem, isRestoring } = useSoftDelete({
    queryKey: ['proveedores', activeTenantId, showDeleted],
    endpoint: 'proveedores',
    modelName: 'proveedor',
    itemName: 'El proveedor',
  });

  const handleOpenModal = (data: Proveedor | null = null) => {
    setEditingData(data);
    form.reset(
      data
        ? {
            nombre: data.nombre,
            numeroDocumento: data.numeroDocumento || '',
            telefono: data.telefono || '',
            correo: data.correo || '',
            categoriaDefault: data.categoriaDefault || '',
            estado: data.estado || 'ACTIVO',
          }
        : { nombre: '', numeroDocumento: '', telefono: '', correo: '', categoriaDefault: '', estado: 'ACTIVO' },
    );
    setModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (itemToDelete) deleteItem(itemToDelete.id);
    setConfirmOpen(false);
    setItemToDelete(null);
  };

  if (!token) return null;

  const dataList = (unwrapList(proveedores) as Proveedor[]).filter((p) => {
    if (!searchTerm) return true;
    const lower = searchTerm.toLowerCase();
    return p.nombre?.toLowerCase().includes(lower) || p.numeroDocumento?.toLowerCase().includes(lower);
  });

  const labelCategoria = (value?: string | null) => CATEGORIAS_GASTO.find((c) => c.value === value)?.label || 'Sin categoría';

  return (
    <Protect permission="transacciones:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Proveedores</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">A quién le pagas: arrendador, proveedores de insumos, empresas de servicios.</p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Buscar proveedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 shadow-xs"
              />
            </div>

            <PapeleraToggle showDeleted={showDeleted} setShowDeleted={setShowDeleted} />

            <Protect permission="transacciones:crear" fallbackType="hide">
              <TenantRequiredButton onClick={() => handleOpenModal()} icon={<Truck className="mr-2 h-4 w-4" />} label="Nuevo Proveedor" />
            </Protect>
          </div>
        </div>

        {isLoading ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-8 flex justify-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
              <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded"></div>
            </div>
          </div>
        ) : dataList.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-full flex items-center justify-center mb-4">
              <Truck className="w-6 h-6" />
            </div>
            <p className="text-base font-semibold text-slate-900 dark:text-white">
              {searchTerm ? 'Ningún proveedor coincide con la búsqueda' : 'No hay proveedores registrados'}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {searchTerm ? 'Prueba con otro nombre o documento.' : 'Registra tu primer proveedor para poder asociarlo a un gasto.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proveedor</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Categoría por defecto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dataList.map((p) => (
                <TableRow key={p.id} className={showDeleted ? 'bg-rose-50/40 dark:bg-rose-500/20 opacity-80' : ''}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-xs shrink-0">
                        {p.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">{p.nombre}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{p.numeroDocumento || 'Sin doc'}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600 dark:text-slate-400">{p.telefono || p.correo || '—'}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600 dark:text-slate-400">{labelCategoria(p.categoriaDefault)}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.estado === 'ACTIVO' ? 'success' : 'outline'}>{p.estado === 'ACTIVO' ? 'Activo' : 'Inactivo'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {showDeleted ? (
                        <Protect permission="sistema:restaurar">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => restoreItem(p.id)}
                            disabled={isRestoring}
                            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 h-8 px-3"
                          >
                            <ArchiveRestore className="h-4 w-4 mr-2" /> Restaurar
                          </Button>
                        </Protect>
                      ) : (
                        <>
                          <Protect permission="transacciones:actualizar" fallbackType="hide">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenModal(p)} className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </Protect>
                          <Protect permission="transacciones:eliminar" fallbackType="hide">
                            <Button variant="ghost" size="icon" onClick={() => { setItemToDelete(p); setConfirmOpen(true); }} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400">
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
      </div>

      <GlobalFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editingData ? 'Editar Proveedor' : 'Nuevo Proveedor'}
        description={editingData ? 'Modifica los datos del proveedor.' : 'Registra a quién le pagas para poder asociarlo a un gasto.'}
        form={form as any}
        sections={[
          {
            fields: [
              { name: 'nombre', label: 'Nombre / Razón Social', type: 'text', placeholder: 'Ej. Inmobiliaria La Central', colSpan: 2 },
              { name: 'numeroDocumento', label: 'NIT / CI (Opcional)', type: 'text' },
              { name: 'telefono', label: 'Teléfono (Opcional)', type: 'text' },
              { name: 'correo', label: 'Correo (Opcional)', type: 'email' },
              { name: 'categoriaDefault', label: 'Categoría por defecto', type: 'select', options: CATEGORIAS_GASTO },
              { name: 'estado', label: 'Estado', type: 'select', options: [{ label: 'Activo', value: 'ACTIVO' }, { label: 'Inactivo', value: 'INACTIVO' }] },
            ],
          },
        ]}
        onSubmit={saveMutation.mutateAsync as any}
        isPending={saveMutation.isPending}
        submitLabel="Guardar Proveedor"
      />

      <GlobalConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Eliminar Proveedor?"
        description={`Estás a punto de eliminar a ${itemToDelete?.nombre}. Podrás restaurarlo desde la papelera.`}
        onConfirm={handleConfirmDelete}
        isDestructive={true}
      />
    </Protect>
  );
}
