"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Protect } from '@/components/ui/protect';
import { VentaRapidaModal } from '@/components/ui/venta-rapida-modal';
import { apiGet } from '@/lib/api-client';
import { CalendarDays, LogIn, Phone, RefreshCw } from 'lucide-react';

export type Segmento = 'PROSPECTO' | 'ACTIVO_VIGENTE' | 'ACTIVO_ENCOLADO' | 'INACTIVO_VENCIDO_RECIENTE' | 'INACTIVO_ABANDONO_TEMPRANO' | 'INACTIVO_CHURN';

// Estado del cliente calculado a partir de sus membresías (plan 11.1), en
// vez del estado manual.
export const ESTADO_SEGMENTO: Record<Segmento, { texto: string; variante: 'success' | 'primary' | 'warning' | 'destructive' | 'default' }> = {
  ACTIVO_VIGENTE: { texto: 'Al día', variante: 'success' },
  ACTIVO_ENCOLADO: { texto: 'Membresía por empezar', variante: 'primary' },
  PROSPECTO: { texto: 'Sin membresía', variante: 'default' },
  INACTIVO_VENCIDO_RECIENTE: { texto: 'Vencida', variante: 'warning' },
  INACTIVO_ABANDONO_TEMPRANO: { texto: 'Vencida', variante: 'warning' },
  INACTIVO_CHURN: { texto: 'Vencida', variante: 'warning' },
};

interface Ficha {
  cliente: { id: string; nombre: string; telefono?: string | null; numeroDocumento?: string | null; segmento: Segmento; estado: string };
  membresiaActual: {
    estado: string;
    planNombre: string;
    tipoPlan: string;
    fechaInicio: string;
    fechaFin: string | null;
    sesionesRestantes: number | null;
    diasRestantes: number | null;
  } | null;
  renovacion: { planId: string; planNombre: string; formaPago: string } | null;
  asistencias: { fechaHora: string; sucursal: string }[];
  reservas: { id: string; clase: string; fechaHora: string; sucursal: string }[];
  pagos: { fechaHora: string; monto: number; formaPago: string; concepto: string }[];
}

const fecha = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', ...(iso.length === 10 ? { timeZone: 'UTC' } : {}) });
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Ficha 360 del cliente (plan 11.1): de un vistazo, su membresía y cuánto le
 * queda, con "Renovar" (mismo plan y forma de pago, en una pantalla),
 * "Registrar ingreso" y "Reservar clase"; debajo, asistencias, reservas y pagos.
 */
export function FichaCliente({ clienteId, onClose }: { clienteId: string | null; onClose: () => void }) {
  const [renovar, setRenovar] = useState(false);
  const { data: ficha, isLoading } = useQuery({
    queryKey: ['ficha-cliente', clienteId],
    queryFn: async () => apiGet<Ficha>(`/clientes/${clienteId}/ficha`),
    enabled: !!clienteId,
  });

  const m = ficha?.membresiaActual;
  const estado = ficha ? ESTADO_SEGMENTO[ficha.cliente.segmento] ?? ESTADO_SEGMENTO.PROSPECTO : null;
  const porVencer = !!m && m.estado === 'ACTIVA' && m.diasRestantes != null && m.diasRestantes <= 7;

  const seccion = (titulo: string, vacio: string, filas: { clave: string; izquierda: string; derecha: string }[]) => (
    <section className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{titulo}</h4>
      {filas.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">{vacio}</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
          {filas.map((f) => (
            <li key={f.clave} className="flex justify-between gap-3 py-1.5">
              <span className="text-slate-700 dark:text-slate-200 truncate">{f.izquierda}</span>
              <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">{f.derecha}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <>
      <Dialog open={!!clienteId && !renovar} onOpenChange={(a) => !a && onClose()}>
        <DialogContent className="sm:max-w-[560px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {ficha?.cliente.nombre ?? 'Cliente'}
              {estado && <Badge variant={porVencer ? 'warning' : estado.variante}>{porVencer ? 'Por vencer' : estado.texto}</Badge>}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap gap-x-4">
              {ficha?.cliente.telefono && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {ficha.cliente.telefono}</span>}
              {ficha?.cliente.numeroDocumento && <span>Doc. {ficha.cliente.numeroDocumento}</span>}
            </DialogDescription>
          </DialogHeader>

          {isLoading || !ficha ? (
            <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ) : (
            <div className="space-y-5">
              {/* Membresía actual */}
              <div className={`rounded-xl border p-4 ${m ? (porVencer ? 'border-amber-300 bg-amber-50 dark:bg-amber-500/10' : 'border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10') : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900'}`}>
                {m ? (
                  <>
                    <p className="font-semibold text-slate-900 dark:text-white">{m.planNombre}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {m.estado === 'EN_ESPERA' && `Empieza el ${fecha(m.fechaInicio)}. `}
                      {m.fechaFin && (m.diasRestantes === 0 ? 'Vence hoy.' : `Vence el ${fecha(m.fechaFin)} (en ${m.diasRestantes} ${m.diasRestantes === 1 ? 'día' : 'días'}).`)}
                      {m.tipoPlan === 'SESIONES' && ` Le quedan ${m.sesionesRestantes ?? 0} sesiones.`}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-600 dark:text-slate-300">No tiene una membresía vigente.</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Protect permission="membresias:crear">
                    <Button size="sm" onClick={() => setRenovar(true)}>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      {ficha.renovacion ? `Renovar ${ficha.renovacion.planNombre}` : 'Vender membresía'}
                    </Button>
                  </Protect>
                  <Protect permission="asistencias:crear">
                    <Link href={`/dashboard/asistencias?cliente=${ficha.cliente.id}`} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
                      <LogIn className="mr-1.5 h-3.5 w-3.5" /> Registrar ingreso
                    </Link>
                  </Protect>
                  <Protect permission="clases:leer">
                    <Link href="/dashboard/clases" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
                      <CalendarDays className="mr-1.5 h-3.5 w-3.5" /> Reservar clase
                    </Link>
                  </Protect>
                </div>
              </div>

              {seccion('Últimas asistencias', 'Todavía no vino.', ficha.asistencias.map((a, i) => ({ clave: `${a.fechaHora}-${i}`, izquierda: fechaHora(a.fechaHora), derecha: a.sucursal })))}
              {ficha.reservas.length > 0 &&
                seccion('Próximas clases', '', ficha.reservas.map((r) => ({ clave: r.id, izquierda: r.clase, derecha: fechaHora(r.fechaHora) })))}
              {seccion('Últimos pagos', 'Sin pagos registrados.', ficha.pagos.map((p, i) => ({ clave: `${p.fechaHora}-${i}`, izquierda: `${p.concepto} · ${p.formaPago}`, derecha: `${fecha(p.fechaHora)} · Bs. ${p.monto.toFixed(2)}` })))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {ficha && (
        <VentaRapidaModal
          open={renovar}
          onOpenChange={setRenovar}
          clienteInicial={{ id: ficha.cliente.id, nombre: ficha.cliente.nombre }}
          planIdInicial={ficha.renovacion?.planId ?? null}
          formaPagoInicial={ficha.renovacion?.formaPago ?? null}
        />
      )}
    </>
  );
}
