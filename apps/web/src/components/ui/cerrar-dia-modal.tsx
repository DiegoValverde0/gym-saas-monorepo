"use client";

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useSucursalActiva } from '@/hooks/use-sucursal-activa';
import { apiGet, apiPost } from '@/lib/api-client';
import { Lock } from 'lucide-react';

interface ResumenDia {
  fecha: string;
  sucursal: { id: string; nombre: string };
  ingresos: Record<string, number>;
  totalIngresos: number;
  efectivoIngresos: number;
  totalGastos: number;
  efectivoGastos: number;
  cantidadCobros: number;
  efectivoInicialSugerido: number;
  cierre: { hora: number; cerradoPor: string | null; efectivoInicial: number; esperado: number; contado: number; diferencia: number; observaciones: string | null } | null;
  cobrosDespuesDelCierre: { cantidad: number; total: number } | null;
}

const NOMBRE_PAGO: Record<string, string> = { EFECTIVO: 'Efectivo', QR: 'QR', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia', PAGO_MOVIL: 'Pago móvil', OTRO: 'Otro' };
const bs = (n: number) => `Bs. ${n.toFixed(2)}`;
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function Diferencia({ valor }: { valor: number }) {
  if (Math.abs(valor) < 0.005) return <span className="font-semibold text-emerald-600 dark:text-emerald-400">Cuadra exacto</span>;
  return valor > 0 ? (
    <span className="font-semibold text-amber-600 dark:text-amber-400">Sobran {bs(valor)}</span>
  ) : (
    <span className="font-semibold text-rose-600 dark:text-rose-400">Faltan {bs(-valor)}</span>
  );
}

/**
 * "Cerrar el día" del modo simple (plan 11.6): lo cobrado hoy por forma de
 * pago y el efectivo esperado frente al contado. No hace falta abrir la caja
 * por la mañana: el efectivo inicial se propone con lo que se contó en el
 * cierre anterior.
 */
export function CerrarDiaModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { sucursalId } = useSucursalActiva();
  const [inicial, setInicial] = useState('');
  const [contado, setContado] = useState('');
  const [nota, setNota] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['cierre-dia', sucursalId],
    queryFn: async () => apiGet<ResumenDia>(`/apertura-caja/dia${sucursalId ? `?sucursalId=${sucursalId}` : ''}`),
    enabled: open,
  });

  useEffect(() => {
    if (open && data) {
      setInicial(String(data.efectivoInicialSugerido));
      setContado('');
      setNota('');
    }
  }, [open, data]);

  const esperado = data ? (Number(inicial) || 0) + data.efectivoIngresos - data.efectivoGastos : 0;
  const hayContado = contado.trim() !== '' && !Number.isNaN(Number(contado));
  const diferencia = hayContado ? Number(contado) - esperado : 0;

  const cerrar = useMutation({
    mutationFn: async () =>
      apiPost<{ diferencia: number }>('/apertura-caja/cerrar-dia', {
        sucursalId: data?.sucursal.id,
        efectivoInicial: Number(inicial) || 0,
        efectivoContado: Number(contado),
        observaciones: nota.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cierre-dia'] });
      toast({ title: 'Día cerrado', description: 'Queda guardado en el historial de la caja.', variant: 'success' });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: 'No se pudo cerrar el día', description: err.message, variant: 'destructive' }),
  });

  const fila = (etiqueta: string, valor: string, fuerte = false) => (
    <div className={`flex justify-between text-sm ${fuerte ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
      <span>{etiqueta}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cerrar el día</DialogTitle>
          <DialogDescription>{data ? `${data.sucursal.nombre} · cuenta el efectivo de la caja y compáralo con lo esperado.` : 'Cargando…'}</DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        ) : data.cierre ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              El día ya se cerró a las {hhmm(data.cierre.hora)}{data.cierre.cerradoPor ? ` (${data.cierre.cerradoPor})` : ''}.
            </p>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-1">
              {fila('Efectivo esperado', bs(data.cierre.esperado))}
              {fila('Efectivo contado', bs(data.cierre.contado), true)}
              <div className="flex justify-end text-sm"><Diferencia valor={data.cierre.diferencia} /></div>
            </div>
            {data.cobrosDespuesDelCierre && data.cobrosDespuesDelCierre.cantidad > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Después del cierre se cobraron {data.cobrosDespuesDelCierre.cantidad} ventas por {bs(data.cobrosDespuesDelCierre.total)}: entrarán en el cierre de mañana.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-1">
              {fila(`Cobrado hoy (${data.cantidadCobros} ${data.cantidadCobros === 1 ? 'venta' : 'ventas'})`, bs(data.totalIngresos), true)}
              {Object.entries(data.ingresos).map(([metodo, monto]) => fila(`· ${NOMBRE_PAGO[metodo] ?? metodo}`, bs(monto)))}
              {data.totalGastos > 0 && fila('Gastos de hoy', `− ${bs(data.totalGastos)}`)}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cierre-inicial">Efectivo al empezar</Label>
                <Input id="cierre-inicial" type="number" min={0} step="0.5" inputMode="decimal" value={inicial} onChange={(e) => setInicial(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cierre-contado">Efectivo contado ahora</Label>
                <Input id="cierre-contado" autoFocus type="number" min={0} step="0.5" inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} />
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3 space-y-1">
              {fila('Efectivo esperado en la caja', bs(esperado), true)}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {bs(Number(inicial) || 0)} al empezar + {bs(data.efectivoIngresos)} cobrado en efectivo{data.efectivoGastos > 0 ? ` − ${bs(data.efectivoGastos)} de gastos en efectivo` : ''}.
              </p>
              {hayContado && <div className="flex justify-end text-sm pt-1"><Diferencia valor={diferencia} /></div>}
            </div>

            {hayContado && Math.abs(diferencia) >= 0.005 && (
              <Input placeholder="¿Por qué no cuadra? (opcional)" aria-label="Nota del cierre" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} />
            )}

            <Button className="w-full" size="lg" disabled={!hayContado || cerrar.isPending} onClick={() => cerrar.mutate()}>
              <Lock className="w-4 h-4 mr-2" />
              {cerrar.isPending ? 'Cerrando…' : 'Cerrar el día'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
