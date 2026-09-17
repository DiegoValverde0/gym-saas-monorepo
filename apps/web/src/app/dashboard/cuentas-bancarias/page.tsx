"use client";

import { useState } from 'react';
import { Protect } from '@/components/ui/protect';
import { GlobalFormModal } from '@/components/ui/global-form-modal';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { Button } from '@/components/ui/button';
import { Edit, Landmark, Trash2, Search } from 'lucide-react';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, apiPatch, apiDelete, unwrapList } from '@/lib/api-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const cuentaSchema = z.object({
  banco: z.string().min(2, "Obligatorio"),
  numeroCuenta: z.string().min(2, "Obligatorio"),
  tipoCuenta: z.string().optional(),
  moneda: z.string().optional(),
});

type CuentaFormValues = z.infer<typeof cuentaSchema>;

interface CuentaBancaria {
  id: string;
  banco: string;
  numeroCuenta: string;
  tipoCuenta?: string | null;
  moneda?: string | null;
  saldo?: number | string;
}

export default function CuentasBancariasPage() {
  const { activeTenantId } = useTenantStore();
  const { token } = useAuth();

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditingData] = useState<CuentaBancaria | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<CuentaBancaria | null>(null);

  const form = useForm<CuentaFormValues>({
    resolver: zodResolver(cuentaSchema),
    defaultValues: { banco: '', numeroCuenta: '', tipoCuenta: '', moneda: 'BOB' },
  });

  const { data: cuentas, isLoading } = useQuery({
    queryKey: ['cuentas', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/cuentas-bancarias')),
    enabled: !!token,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: CuentaFormValues) => {
      const isEdit = !!editingData;
      return isEdit
        ? apiPatch(`/cuentas-bancarias/${editingData.id}`, data)
        : apiPost('/cuentas-bancarias', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cuentas'] });
      setModalOpen(false);
      setEditingData(null);
      form.reset();
      toast({ title: 'Éxito', description: 'Cuenta bancaria guardada correctamente.', variant: 'success' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiDelete(`/cuentas-bancarias/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cuentas'] });
      setConfirmOpen(false);
      setItemToDelete(null);
      toast({ title: 'Éxito', description: 'Cuenta eliminada.', variant: 'success' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const handleOpenModal = (data: CuentaBancaria | null = null) => {
    setEditingData(data);
    if (data) {
        form.reset({
            banco: data.banco,
            numeroCuenta: data.numeroCuenta,
            tipoCuenta: data.tipoCuenta || '',
            moneda: data.moneda || 'BOB'
        });
    } else {
        form.reset({ banco: '', numeroCuenta: '', tipoCuenta: '', moneda: 'BOB' });
    }
    setModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (itemToDelete) deleteMutation.mutate(itemToDelete.id);
  };

  if (!token) return null;

  const dataList = (cuentas as CuentaBancaria[] || []).filter((c: CuentaBancaria) => {
    if (!searchTerm) return true;
    const lower = searchTerm.toLowerCase();
    return c.banco?.toLowerCase().includes(lower) || c.numeroCuenta?.toLowerCase().includes(lower);
  });

  return (
    <Protect permission="cuentas_bancarias:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Cuentas Bancarias</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Registra los métodos de depósito y billeteras digitales de tu negocio.</p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Buscar cuenta..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 shadow-xs"
              />
            </div>
            <Protect permission="cuentas_bancarias:crear" fallbackType="hide">
              <TenantRequiredButton
                onClick={() => handleOpenModal()}
                icon={<Landmark className="mr-2 h-4 w-4" />}
                label="Nueva Cuenta"
              />
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
              <Landmark className="w-6 h-6" />
            </div>
            <p className="text-base font-semibold text-slate-900 dark:text-white">
              {searchTerm ? 'Ninguna cuenta coincide con la búsqueda' : 'No hay cuentas bancarias registradas'}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {searchTerm ? 'Prueba con otro banco o número.' : 'Agrega tu primera cuenta para recibir transferencias.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Banco / Billetera</TableHead>
                <TableHead>Número de Cuenta</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Saldo Referencial</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dataList.map((c: CuentaBancaria) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-xs shrink-0">
                        {c.banco.charAt(0).toUpperCase()}
                      </div>
                      <p className="font-semibold text-slate-900 dark:text-white text-sm">{c.banco}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600 dark:text-slate-400">{c.numeroCuenta}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600 dark:text-slate-400">{c.tipoCuenta || 'N/A'}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{c.moneda} {Number(c.saldo).toFixed(2)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Protect permission="cuentas_bancarias:actualizar" fallbackType="hide">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenModal(c)} className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </Protect>
                      <Protect permission="cuentas_bancarias:eliminar" fallbackType="hide">
                        <Button variant="ghost" size="icon" onClick={() => { setItemToDelete(c); setConfirmOpen(true); }} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400">
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
      </div>

      <GlobalFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editingData ? 'Editar Cuenta' : 'Nueva Cuenta Bancaria'}
        description={editingData ? 'Modifica los datos de la cuenta.' : 'Añade una nueva cuenta para recibir transferencias.'}
        form={form as any}
        sections={[
          {
            fields: [
              { name: 'banco', label: 'Nombre del Banco o Billetera', type: 'text', colSpan: 2 },
              { name: 'numeroCuenta', label: 'Número de Cuenta', type: 'text', colSpan: 2 },
              { name: 'tipoCuenta', label: 'Tipo de Cuenta (Opcional)', type: 'text' },
              { name: 'moneda', label: 'Moneda', type: 'text' }
            ]
          }
        ]}
        onSubmit={saveMutation.mutateAsync as any}
        isPending={saveMutation.isPending}
        submitLabel="Guardar Cuenta"
      />

      <GlobalConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Eliminar Cuenta Bancaria?"
        description={`Estás a punto de eliminar la cuenta ${itemToDelete?.banco}. Esta acción no se puede deshacer si no está atada a transacciones.`}
        onConfirm={handleConfirmDelete}
        isDestructive={true}
      />
    </Protect>
  );
}
