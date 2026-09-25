"use client";

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPost, unwrapList } from '@/lib/api-client';
import { Search, CheckCircle2 } from 'lucide-react';

interface Cliente { id: string; nombre: string; numeroDocumento?: string | null; telefono?: string | null }
interface Plan { id: string; nombre: string; precio: string | number; tipoPlan: string; duracionDias?: number | null; cantidadSesiones?: number | null }
interface MembresiaCreada { id: string; montoFinal: string | number }

const FORMAS_DE_PAGO = [
  { valor: 'EFECTIVO', nombre: 'Efectivo' },
  { valor: 'QR', nombre: 'QR' },
  { valor: 'TARJETA', nombre: 'Tarjeta' },
  { valor: 'TRANSFERENCIA', nombre: 'Transferencia' },
];

const describirPlan = (p: Plan) =>
  p.tipoPlan === 'SESIONES' ? `${p.cantidadSesiones ?? 0} sesiones` : p.tipoPlan === 'VISITA' ? 'Pase de un día' : `${p.duracionDias ?? 30} días`;

function useDebounce<T>(valor: T, ms = 300) {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

/**
 * Venta de membresía en una sola pantalla para el modo simple (plan de
 * simplificación, 4.4): cliente, plan y forma de pago. Crea la membresía y la
 * cobra en el acto. En modo simple el backend no exige turno de caja y manda
 * el dinero a "Efectivo del gimnasio" si no se indica cuenta.
 */
export function VentaRapidaModal({
  open,
  onOpenChange,
  planes,
  sucursalId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planes: Plan[];
  sucursalId?: string | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [planId, setPlanId] = useState('');
  const [formaPago, setFormaPago] = useState('EFECTIVO');
  const busquedaDebounced = useDebounce(busqueda);

  useEffect(() => {
    if (open) {
      setBusqueda('');
      setCliente(null);
      setPlanId(planes.length === 1 ? planes[0].id : '');
      setFormaPago('EFECTIVO');
    }
  }, [open, planes]);

  const { data: resultados = [] } = useQuery({
    queryKey: ['clientes-venta-rapida', busquedaDebounced],
    queryFn: async () => unwrapList<Cliente>(await apiGet(`/clientes?search=${encodeURIComponent(busquedaDebounced)}&limit=6`)),
    enabled: open && !cliente && busquedaDebounced.trim().length >= 2,
  });

  const plan = planes.find((p) => p.id === planId);

  const vender = useMutation({
    mutationFn: async () => {
      if (!cliente || !plan) throw new Error('Elige el cliente y el plan.');
      const membresia = await apiPost<MembresiaCreada>('/membresias', {
        clienteId: cliente.id,
        planId: plan.id,
        ...(sucursalId ? { sucursalId } : {}),
      });
      const total = Number(membresia.montoFinal);
      try {
        await apiPost('/transacciones', {
          ...(sucursalId ? { sucursalId } : {}),
          clienteId: cliente.id,
          tipo: 'INGRESO',
          montoTotal: total,
          detalles: [{ tipoConcepto: 'MEMBRESIA', membresiaId: membresia.id, cantidad: 1, precioUnitario: total, subtotal: total }],
          pagos: [{ metodoPago: formaPago, monto: total }],
        });
      } catch (err) {
        throw new Error(`La membresía quedó registrada pero no se pudo cobrar: ${(err as Error).message} Puedes cobrarla desde la lista.`);
      }
      return total;
    },
    onSuccess: (total) => {
      queryClient.invalidateQueries({ queryKey: ['membresias'] });
      queryClient.invalidateQueries({ queryKey: ['primeros-pasos'] });
      toast({ title: 'Venta registrada', description: `${cliente?.nombre} ya tiene su membresía ${plan?.nombre} activa (Bs. ${total.toFixed(2)}).`, variant: 'success' });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ['membresias'] });
      toast({ title: 'No se completó la venta', description: err.message, variant: 'destructive' });
    },
  });

  const chip = (activo: boolean) =>
    `rounded-lg border px-3 py-2 text-sm text-left transition-colors ${activo ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-900 dark:text-indigo-100' : 'border-zinc-200 dark:border-zinc-800 hover:border-indigo-300'}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Vender membresía</DialogTitle>
          <DialogDescription>Elige el cliente, el plan y cómo paga. Queda activa al cobrar.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="venta-cliente">Cliente</Label>
            {cliente ? (
              <div className="flex items-center justify-between rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-500/20 px-3 py-2 text-sm">
                <span className="font-semibold text-indigo-900 dark:text-indigo-100">{cliente.nombre}</span>
                <button type="button" onClick={() => setCliente(null)} className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:underline">Cambiar</button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input id="venta-cliente" autoFocus placeholder="Nombre, documento o teléfono" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="pl-9" />
                </div>
                {resultados.length > 0 && (
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
                    {resultados.map((c) => (
                      <button key={c.id} type="button" onClick={() => setCliente(c)} className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900">
                        <span className="font-medium">{c.nombre}</span>
                        <span className="ml-2 text-xs text-zinc-500">{c.numeroDocumento || c.telefono || ''}</span>
                      </button>
                    ))}
                  </div>
                )}
                {busquedaDebounced.trim().length >= 2 && resultados.length === 0 && (
                  <p className="text-xs text-zinc-500">No hay clientes con ese dato. Regístralo primero en Clientes.</p>
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>Plan</Label>
            {planes.length === 0 ? (
              <p className="text-sm text-zinc-500">Todavía no hay planes. Crea uno en Planes.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {planes.map((p) => (
                  <button key={p.id} type="button" onClick={() => setPlanId(p.id)} className={chip(p.id === planId)}>
                    <span className="block font-semibold">{p.nombre}</span>
                    <span className="block text-xs text-zinc-500">{describirPlan(p)} · Bs. {Number(p.precio).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Forma de pago</Label>
            <div className="flex flex-wrap gap-2">
              {FORMAS_DE_PAGO.map((f) => (
                <button key={f.valor} type="button" onClick={() => setFormaPago(f.valor)} className={chip(f.valor === formaPago)}>{f.nombre}</button>
              ))}
            </div>
          </div>

          <Button className="w-full" size="lg" disabled={!cliente || !plan || vender.isPending} onClick={() => vender.mutate()}>
            <CheckCircle2 className="w-4 h-4 mr-2" />
            {vender.isPending ? 'Cobrando...' : plan ? `Cobrar Bs. ${Number(plan.precio).toFixed(2)}` : 'Cobrar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
