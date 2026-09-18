import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, unwrapList } from '@/lib/api-client';
import { Wallet, Plus, Trash2, AlertCircle } from 'lucide-react';

interface MembresiaItem {
  id: string;
  montoFinal: string | number;
  sucursalId?: string;
  clienteId: string;
  cliente?: { nombre: string };
  plan?: { nombre: string };
}

interface TransaccionPayload {
  sucursalId: string;
  clienteId: string;
  tipo: string;
  montoTotal: number;
  detalles: Array<{
    tipoConcepto: string;
    membresiaId: string;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
  }>;
  pagos: Array<{
    metodoPago: string;
    monto: number;
    cuentaBancariaId?: string;
  }>;
}

interface CuentaBancaria {
  id: string;
  banco: string;
  numeroCuenta: string;
}

export function POSModal({ open, onOpenChange, item }: { open: boolean, onOpenChange: (open: boolean) => void, item: MembresiaItem | null }) {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { token, user } = useAuth({ redirectIfUnauthenticated: false });
  const userSucursalId = user?.sucursalId;

  const montoTotal = item ? Number(item.montoFinal) : 0;
  
  const [pagos, setPagos] = useState([{ id: Date.now(), metodoPago: 'EFECTIVO', monto: '', cuentaBancariaId: '' }]);
  const [efectivoRecibido, setEfectivoRecibido] = useState('');

  // useEffect moved below cuentasData

  const { data: estadoApertura } = useQuery({
    queryKey: ['apertura-caja', 'me'],
    queryFn: async () => apiGet('/apertura-caja/me'),
    enabled: !!token && open,
  });

  const { data: cuentasData } = useQuery({
    queryKey: ['cuentas', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/cuentas-bancarias')),
    enabled: !!token && open,
  });

  const cuentasList = cuentasData || [];

  useEffect(() => {
      if (open && item) {
          const cuentaDefault = cuentasList.length === 1 ? (cuentasList[0] as any).id : '';
          setPagos([{ id: Date.now(), metodoPago: 'EFECTIVO', monto: String(montoTotal), cuentaBancariaId: cuentaDefault }]);
          setEfectivoRecibido(String(montoTotal));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item, montoTotal, cuentasData]);

  const cobrarMutation = useMutation({
    mutationFn: async (payload: TransaccionPayload) => apiPost('/transacciones', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['membresias'] });
      queryClient.invalidateQueries({ queryKey: ['cajas'] });
      onOpenChange(false);
      toast({ title: 'Cobro Exitoso', description: 'La membresía ha sido pagada y activada.', variant: 'success' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  });

  if (!item) return null;

  const totalPagos = pagos.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
  const diferencia = montoTotal - totalPagos;
  
  // Lógica de vuelto inteligente (solo para un pago en efectivo)
  let vuelto = 0;
  if (pagos.length === 1 && pagos[0].metodoPago === 'EFECTIVO' && Number(efectivoRecibido) > montoTotal) {
      vuelto = Number(efectivoRecibido) - montoTotal;
  }

  const handleCobrar = () => {
      if (!(estadoApertura as any)?.abierta) {
          toast({ title: 'Caja Cerrada', description: 'Debes abrir tu turno de caja para cobrar.', variant: 'destructive' });
          return;
      }
      if (Math.abs(diferencia) > 0.01) {
          toast({ title: 'Montos incorrectos', description: 'La suma de los pagos debe ser igual al total a cobrar.', variant: 'destructive' });
          return;
      }

      // Preparar payload enviando SOLO el monto real de la transacción para Efectivo, no el recibido (Norma POS)
      const pagosPayload = pagos.map(p => {
          let montoARegistrar = Number(p.monto);
          if (pagos.length === 1 && p.metodoPago === 'EFECTIVO') {
              montoARegistrar = montoTotal; // Ajuste automático del vuelto
          }
          return {
              metodoPago: p.metodoPago,
              monto: montoARegistrar,
              cuentaBancariaId: p.cuentaBancariaId || undefined
          };
      });

      const payload = {
          sucursalId: item.sucursalId || userSucursalId || activeTenantId,
          clienteId: item.clienteId,
          tipo: 'INGRESO',
          montoTotal: montoTotal,
          detalles: [
              {
                  tipoConcepto: 'MEMBRESIA',
                  membresiaId: item.id,
                  cantidad: 1,
                  precioUnitario: montoTotal,
                  subtotal: montoTotal
              }
          ],
          pagos: pagosPayload
      };

      cobrarMutation.mutate(payload as any);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Misma barra gris que el resto de los modales de la app (ver
            global-form-modal.tsx / membresia-wizard-modal.tsx). El cuerpo de
            este modal sigue siendo un layout de 2 paneles propio del punto de
            venta -- eso es intencional, no un formulario de campos comunes. */}
        <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-b flex justify-between items-center shrink-0">
          <div>
            <DialogTitle className="text-xl flex items-center gap-2">
                <Wallet className="w-5 h-5 text-indigo-600" />
                Punto de Venta / Cobro
            </DialogTitle>
            <DialogDescription className="mt-1">Registra el pago de esta membresía para activarla.</DialogDescription>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
        {(estadoApertura as any) && !(estadoApertura as any).abierta && (
            <div className="bg-red-50 text-red-700 p-4 rounded-md flex items-center gap-3 border border-red-200">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="font-bold text-sm">NO TIENES UN TURNO DE CAJA ABIERTO. Ve al módulo de Cajas y abre tu turno antes de procesar ventas.</p>
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* PANEL IZQUIERDO: DETALLE */}
            <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
                <h3 className="font-bold text-zinc-800 border-b pb-2">Resumen de Compra</h3>
                <div>
                    <p className="text-xs text-zinc-500 uppercase font-bold">Cliente</p>
                    <p className="text-lg font-medium">{item.cliente?.nombre}</p>
                </div>
                <div>
                    <p className="text-xs text-zinc-500 uppercase font-bold">Concepto</p>
                    <p className="font-medium">{item.plan?.nombre}</p>
                </div>
                <div className="bg-indigo-50 p-4 rounded-lg flex justify-between items-center mt-6">
                    <span className="font-bold text-indigo-900">A Pagar:</span>
                    <span className="text-2xl font-black text-indigo-700">Bs. {montoTotal.toFixed(2)}</span>
                </div>
            </div>

            {/* PANEL DERECHO: PAGOS */}
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="font-bold text-zinc-800">Métodos de Pago</h3>
                    <Button variant="ghost" size="sm" onClick={() => setPagos([...pagos, { id: Date.now(), metodoPago: 'TRANSFERENCIA', monto: '', cuentaBancariaId: '' }])}>
                        <Plus className="w-4 h-4 mr-1" /> Dividir Pago
                    </Button>
                </div>

                <div className="space-y-3">
                    {pagos.map((p) => (
                        <div key={p.id} className="bg-white p-4 rounded-xl border shadow-sm space-y-3 relative">
                            {pagos.length > 1 && (
                                <button onClick={() => setPagos(pagos.filter(x => x.id !== p.id))} className="absolute top-2 right-2 text-zinc-400 hover:text-red-500">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="text-xs font-bold text-zinc-500">Método</label>
                                    <select 
                                        className="w-full h-9 rounded-md border text-sm px-2"
                                        value={p.metodoPago}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setPagos(pagos.map(x => x.id === p.id ? { ...x, metodoPago: val } : x));
                                        }}
                                    >
                                        <option value="EFECTIVO">Efectivo</option>
                                        <option value="TRANSFERENCIA">Transferencia</option>
                                        <option value="QR">QR</option>
                                        <option value="TARJETA">Tarjeta</option>
                                    </select>
                                </div>
                                <div className="w-24">
                                    <label className="text-xs font-bold text-zinc-500">Monto</label>
                                    <Input 
                                        type="number" 
                                        className="h-9 font-bold" 
                                        value={p.monto} 
                                        onChange={e => setPagos(pagos.map(x => x.id === p.id ? { ...x, monto: e.target.value } : x))}
                                    />
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-xs font-bold text-zinc-500">Destino (Cuenta Bancaria o Caja)</label>
                                <select 
                                    className="w-full h-9 rounded-md border text-sm px-2 mt-1"
                                    value={p.cuentaBancariaId}
                                    onChange={e => setPagos(pagos.map(x => x.id === p.id ? { ...x, cuentaBancariaId: e.target.value } : x))}
                                >
                                    <option value="">Selecciona una cuenta...</option>
                                    {(cuentasList as CuentaBancaria[]).map((c: CuentaBancaria) => (
                                        <option key={c.id} value={c.id}>{c.banco} - {c.numeroCuenta}</option>
                                    ))}
                                </select>
                            </div>

                            {pagos.length === 1 && p.metodoPago === 'EFECTIVO' && (
                                <div className="pt-2 border-t mt-2">
                                    <label className="text-xs font-bold text-zinc-500">Efectivo Recibido (Para Vuelto)</label>
                                    <Input 
                                        type="number" 
                                        className="h-9" 
                                        value={efectivoRecibido} 
                                        onChange={e => {
                                            setEfectivoRecibido(e.target.value);
                                            // p.monto will stay exactly as montoTotal to pass validation backend
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="bg-white p-4 rounded-xl border shadow-sm space-y-1">
                    <div className="flex justify-between text-sm">
                        <span className="text-zinc-500 font-bold">Total Distribuido:</span>
                        <span className="font-bold">Bs. {totalPagos.toFixed(2)}</span>
                    </div>
                    {diferencia !== 0 && (
                        <div className="flex justify-between text-sm text-red-500">
                            <span className="font-bold">Falta Cubrir:</span>
                            <span className="font-bold">Bs. {diferencia > 0 ? diferencia.toFixed(2) : 'EXCEDIDO'}</span>
                        </div>
                    )}
                    {vuelto > 0 && (
                        <div className="flex justify-between text-sm text-amber-600 bg-amber-50 p-2 rounded mt-2 border border-amber-200">
                            <span className="font-bold">Cambio / Vuelto a entregar:</span>
                            <span className="font-black text-lg">Bs. {vuelto.toFixed(2)}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
        </div>

        <div className="flex justify-between items-center px-6 py-4 border-t shrink-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={cobrarMutation.isPending}>
                Cancelar
            </Button>
            <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleCobrar}
                disabled={cobrarMutation.isPending || !(estadoApertura as any)?.abierta || Math.abs(diferencia) > 0.01}
            >
                {cobrarMutation.isPending ? 'Procesando...' : 'Confirmar Cobro'}
            </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
