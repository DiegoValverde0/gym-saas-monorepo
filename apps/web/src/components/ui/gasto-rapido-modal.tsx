"use client";

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useModoUso } from '@/hooks/use-modo-uso';
import { useSucursalActiva } from '@/hooks/use-sucursal-activa';
import { useTenantStore } from '@/store/use-tenant-store';
import { apiGet, apiPost, unwrapList } from '@/lib/api-client';
import { Receipt } from 'lucide-react';

// Lista corta de conceptos (plan 11.7). Los valores son los TipoConceptoVenta de egreso.
const CONCEPTOS = [
  { valor: 'ALQUILER', nombre: 'Alquiler' },
  { valor: 'SERVICIOS_BASICOS', nombre: 'Luz, agua, internet' },
  { valor: 'NOMINA', nombre: 'Sueldos' },
  { valor: 'INSUMOS', nombre: 'Insumos' },
  { valor: 'MANTENIMIENTO', nombre: 'Mantenimiento' },
  { valor: 'OTRO_GASTO', nombre: 'Otro' },
];

const FORMAS_DE_PAGO = [
  { valor: 'EFECTIVO', nombre: 'Efectivo' },
  { valor: 'TRANSFERENCIA', nombre: 'Transferencia' },
  { valor: 'QR', nombre: 'QR' },
  { valor: 'TARJETA', nombre: 'Tarjeta' },
];

interface Cuenta { id: string; banco: string; numeroCuenta: string }

/**
 * "Registrar gasto" en una pantalla (plan 11.7): monto, concepto de una lista
 * corta y cómo se pagó. En modo simple el gasto sale de "Efectivo del
 * gimnasio"; en los otros modos se elige la cuenta, como en Gastos.
 */
export function GastoRapidoModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const { activeTenantId } = useTenantStore();
  const { esSimple } = useModoUso();
  const { sucursalId } = useSucursalActiva();

  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [nota, setNota] = useState('');
  const [formaPago, setFormaPago] = useState('EFECTIVO');
  const [cuentaId, setCuentaId] = useState('');

  const { data: cuentas } = useQuery({
    queryKey: ['cuentas', activeTenantId],
    queryFn: async () => unwrapList<Cuenta>(await apiGet('/cuentas-bancarias')),
    enabled: !!token && open && !esSimple,
  });

  useEffect(() => {
    if (!open) return;
    setMonto('');
    setConcepto('');
    setNota('');
    setFormaPago('EFECTIVO');
  }, [open]);

  useEffect(() => {
    if (open && cuentas && !cuentaId) setCuentaId(cuentas.length === 1 ? cuentas[0].id : '');
  }, [open, cuentas, cuentaId]);

  const valor = Number(monto);
  const faltaNota = concepto === 'OTRO_GASTO' && !nota.trim();
  const valido = valor > 0 && !!concepto && !faltaNota && (esSimple || !!cuentaId);

  const registrar = useMutation({
    mutationFn: async () =>
      apiPost('/transacciones', {
        ...(sucursalId ? { sucursalId } : {}),
        tipo: 'EGRESO',
        montoTotal: valor,
        detalles: [{ tipoConcepto: concepto, descripcionLibre: nota.trim() || undefined, cantidad: 1, precioUnitario: valor, subtotal: valor }],
        pagos: [{ metodoPago: formaPago, monto: valor, ...(!esSimple && cuentaId ? { cuentaBancariaId: cuentaId } : {}) }],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastos'] });
      queryClient.invalidateQueries({ queryKey: ['cuentas'] });
      queryClient.invalidateQueries({ queryKey: ['cierre-dia'] });
      toast({ title: 'Gasto registrado', description: `Bs. ${valor.toFixed(2)} · ${CONCEPTOS.find((c) => c.valor === concepto)?.nombre}`, variant: 'success' });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: 'No se pudo registrar el gasto', description: err.message, variant: 'destructive' }),
  });

  const chip = (activo: boolean) =>
    `rounded-lg border px-3 py-2 text-sm text-left transition-colors ${activo ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-900 dark:text-indigo-100' : 'border-zinc-200 dark:border-zinc-800 hover:border-indigo-300'}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Registrar gasto</DialogTitle>
          <DialogDescription>Queda registrado con la fecha de hoy.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="gasto-monto">Monto (Bs.)</Label>
            <Input id="gasto-monto" autoFocus type="number" min={0} step="0.5" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} className="text-lg h-12" />
          </div>
          <div className="space-y-2">
            <Label>¿En qué se gastó?</Label>
            <div className="grid grid-cols-2 gap-2">
              {CONCEPTOS.map((c) => (
                <button key={c.valor} type="button" onClick={() => setConcepto(c.valor)} className={chip(c.valor === concepto)}>{c.nombre}</button>
              ))}
            </div>
            <Input
              placeholder={concepto === 'OTRO_GASTO' ? '¿Qué fue? (obligatorio)' : 'Detalle (opcional)'}
              aria-label="Detalle del gasto"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label>¿Cómo se pagó?</Label>
            <div className="flex flex-wrap gap-2">
              {FORMAS_DE_PAGO.map((f) => (
                <button key={f.valor} type="button" onClick={() => setFormaPago(f.valor)} className={chip(f.valor === formaPago)}>{f.nombre}</button>
              ))}
            </div>
            {!esSimple && (
              <select
                aria-label="Cuenta de la que sale el dinero"
                value={cuentaId}
                onChange={(e) => setCuentaId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">¿De qué cuenta sale el dinero?</option>
                {(cuentas ?? []).map((c) => <option key={c.id} value={c.id}>{c.banco} · {c.numeroCuenta}</option>)}
              </select>
            )}
          </div>
          <Button className="w-full" size="lg" disabled={!valido || registrar.isPending} onClick={() => registrar.mutate()}>
            <Receipt className="w-4 h-4 mr-2" />
            {registrar.isPending ? 'Guardando...' : valor > 0 ? `Registrar gasto de Bs. ${valor.toFixed(2)}` : 'Registrar gasto'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
