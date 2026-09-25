"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useModoUso } from '@/hooks/use-modo-uso';
import { useSucursalActiva } from '@/hooks/use-sucursal-activa';
import { useTenantStore } from '@/store/use-tenant-store';
import { apiGet, apiPost, unwrapList } from '@/lib/api-client';
import { AlertTriangle, CheckCircle2, Minus, Plus } from 'lucide-react';

interface Producto { id: string; nombre: string; precioVenta: string | number; estado?: string }
interface Inventario { productoId: string; sucursalId: string; cantidadActual: number }
interface Cuenta { id: string; banco: string; numeroCuenta: string }

const FORMAS_DE_PAGO = [
  { valor: 'EFECTIVO', nombre: 'Efectivo' },
  { valor: 'QR', nombre: 'QR' },
  { valor: 'TARJETA', nombre: 'Tarjeta' },
  { valor: 'TRANSFERENCIA', nombre: 'Transferencia' },
];

/**
 * Venta de productos en una pantalla (plan 4.4 y 11.5): tocar los productos,
 * ajustar cantidades, elegir cómo paga y cobrar. Desde intermedio muestra el
 * stock de la sucursal; la venta lo descuenta en el servidor.
 */
export function VentaProductoModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const { activeTenantId } = useTenantStore();
  const { esSimple } = useModoUso();
  const { sucursalId } = useSucursalActiva();
  const [carrito, setCarrito] = useState<Record<string, number>>({});
  const [formaPago, setFormaPago] = useState('EFECTIVO');
  const [cuentaId, setCuentaId] = useState('');

  const { data: productos } = useQuery({
    queryKey: ['productos', activeTenantId],
    queryFn: async () => unwrapList<Producto>(await apiGet('/productos')),
    enabled: !!token && open,
  });
  const { data: inventarios } = useQuery({
    queryKey: ['inventarios', activeTenantId],
    queryFn: async () => unwrapList<Inventario>(await apiGet('/inventarios')),
    enabled: !!token && open && !esSimple,
  });
  const { data: caja } = useQuery({
    queryKey: ['apertura-caja-me'],
    queryFn: async () => apiGet<{ abierta: boolean }>('/apertura-caja/me'),
    enabled: !!token && open && !esSimple,
  });
  const { data: cuentas } = useQuery({
    queryKey: ['cuentas', activeTenantId],
    queryFn: async () => unwrapList<Cuenta>(await apiGet('/cuentas-bancarias')),
    enabled: !!token && open && !esSimple,
  });

  useEffect(() => {
    if (!open) return;
    setCarrito({});
    setFormaPago('EFECTIVO');
  }, [open]);
  useEffect(() => {
    if (open && cuentas && !cuentaId) setCuentaId(cuentas.length === 1 ? cuentas[0].id : '');
  }, [open, cuentas, cuentaId]);

  const activos = (productos ?? []).filter((p) => !p.estado || p.estado === 'ACTIVO');
  const stock = (productoId: string) => inventarios?.find((i) => i.productoId === productoId && i.sucursalId === sucursalId)?.cantidadActual;
  const lineas = activos.filter((p) => (carrito[p.id] ?? 0) > 0).map((p) => ({ producto: p, cantidad: carrito[p.id], subtotal: Number(p.precioVenta) * carrito[p.id] }));
  const total = lineas.reduce((s, l) => s + l.subtotal, 0);
  const cambiar = (id: string, delta: number) => setCarrito((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + delta) }));
  const faltaCaja = !esSimple && caja && !caja.abierta;

  const vender = useMutation({
    mutationFn: async () =>
      apiPost('/transacciones', {
        ...(sucursalId ? { sucursalId } : {}),
        tipo: 'INGRESO',
        montoTotal: total,
        detalles: lineas.map((l) => ({ tipoConcepto: 'PRODUCTO', productoId: l.producto.id, cantidad: l.cantidad, precioUnitario: Number(l.producto.precioVenta), subtotal: l.subtotal })),
        pagos: [{ metodoPago: formaPago, monto: total, ...(!esSimple && cuentaId ? { cuentaBancariaId: cuentaId } : {}) }],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventarios'] });
      queryClient.invalidateQueries({ queryKey: ['cierre-dia'] });
      queryClient.invalidateQueries({ queryKey: ['reportes'] });
      toast({ title: 'Venta registrada', description: `Bs. ${total.toFixed(2)}`, variant: 'success' });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: 'No se completó la venta', description: err.message, variant: 'destructive' }),
  });

  const chip = (activo: boolean) =>
    `rounded-lg border px-3 py-2 text-sm text-left transition-colors ${activo ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-900 dark:text-indigo-100' : 'border-zinc-200 dark:border-zinc-800 hover:border-indigo-300'}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vender producto</DialogTitle>
          <DialogDescription>Toca los productos, ajusta la cantidad y cobra.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {activos.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Todavía no hay productos. <Link href="/dashboard/productos" className="text-indigo-600 underline">Crea uno en Productos</Link>.
            </p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800 max-h-72 overflow-y-auto">
              {activos.map((p) => {
                const n = carrito[p.id] ?? 0;
                const quedan = stock(p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <button type="button" onClick={() => cambiar(p.id, 1)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-medium">{p.nombre}</span>
                      <span className="block text-xs text-zinc-500">
                        Bs. {Number(p.precioVenta).toFixed(2)}
                        {quedan != null && ` · quedan ${quedan}`}
                      </span>
                    </button>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => cambiar(p.id, -1)} disabled={n === 0} aria-label={`Quitar un ${p.nombre}`}>
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-6 text-center text-sm font-semibold tabular-nums">{n}</span>
                      <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => cambiar(p.id, 1)} aria-label={`Agregar un ${p.nombre}`}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            <Label>Forma de pago</Label>
            <div className="flex flex-wrap gap-2">
              {FORMAS_DE_PAGO.map((f) => (
                <button key={f.valor} type="button" onClick={() => setFormaPago(f.valor)} className={chip(f.valor === formaPago)}>{f.nombre}</button>
              ))}
            </div>
            {!esSimple && (
              <select
                aria-label="Cuenta donde entra el dinero"
                value={cuentaId}
                onChange={(e) => setCuentaId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">¿A qué cuenta entra el dinero?</option>
                {(cuentas ?? []).map((c) => <option key={c.id} value={c.id}>{c.banco} · {c.numeroCuenta}</option>)}
              </select>
            )}
          </div>

          {faltaCaja && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/20 p-3 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Para cobrar necesitas tu caja abierta. <Link href="/dashboard/cajas" className="font-semibold underline">Abrir caja</Link></span>
            </p>
          )}

          <Button className="w-full" size="lg" disabled={lineas.length === 0 || faltaCaja || (!esSimple && !cuentaId) || vender.isPending} onClick={() => vender.mutate()}>
            <CheckCircle2 className="w-4 h-4 mr-2" />
            {vender.isPending ? 'Cobrando...' : `Cobrar Bs. ${total.toFixed(2)}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
