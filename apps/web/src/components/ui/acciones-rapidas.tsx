"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePermissions } from '@/hooks/use-permissions';
import { useModulosActivos } from '@/hooks/use-modulos-activos';
import { useModoUso } from '@/hooks/use-modo-uso';
import { VentaRapidaModal } from '@/components/ui/venta-rapida-modal';
import { GastoRapidoModal } from '@/components/ui/gasto-rapido-modal';
import { CerrarDiaModal } from '@/components/ui/cerrar-dia-modal';
import { VentaProductoModal } from '@/components/ui/venta-producto-modal';
import { IdCard, Lock, LogIn, Receipt, ShoppingCart } from 'lucide-react';

const estilo =
  'flex flex-col items-start gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-left shadow-xs transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 dark:hover:bg-indigo-500/10';

/**
 * Lo que se hace todos los días, a un toque desde el Dashboard del modo
 * simple (criterio de la fase 5: vender, registrar ingreso, registrar gasto y
 * cerrar el día en 3 pasos o menos).
 */
export function AccionesRapidas() {
  const { esSimple } = useModoUso();
  const { hasPermission } = usePermissions();
  const modulos = useModulosActivos();
  const [abierto, setAbierto] = useState<'venta' | 'producto' | 'gasto' | 'cierre' | null>(null);

  if (!esSimple) return null;

  const acciones = [
    hasPermission('membresias:crear') && (
      <button key="venta" type="button" className={estilo} onClick={() => setAbierto('venta')}>
        <IdCard className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        <span className="font-semibold text-slate-900 dark:text-white">Vender membresía</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">Nueva o renovación</span>
      </button>
    ),
    modulos.puntoVenta && hasPermission('transacciones:crear') && (
      <button key="producto" type="button" className={estilo} onClick={() => setAbierto('producto')}>
        <ShoppingCart className="h-5 w-5 text-sky-600 dark:text-sky-400" />
        <span className="font-semibold text-slate-900 dark:text-white">Vender producto</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">Bebidas, suplementos…</span>
      </button>
    ),
    modulos.controlAcceso && hasPermission('asistencias:crear') && (
      <Link key="ingreso" href="/dashboard/asistencias" className={estilo}>
        <LogIn className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        <span className="font-semibold text-slate-900 dark:text-white">Registrar ingreso</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">Quién entra al gimnasio</span>
      </Link>
    ),
    modulos.controlGastos && hasPermission('transacciones:crear') && (
      <button key="gasto" type="button" className={estilo} onClick={() => setAbierto('gasto')}>
        <Receipt className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        <span className="font-semibold text-slate-900 dark:text-white">Registrar gasto</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">Alquiler, sueldos, insumos…</span>
      </button>
    ),
    hasPermission('aperturas_caja:crear') && (
      <button key="cierre" type="button" className={estilo} onClick={() => setAbierto('cierre')}>
        <Lock className="h-5 w-5 text-slate-600 dark:text-slate-300" />
        <span className="font-semibold text-slate-900 dark:text-white">Cerrar el día</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">Cuenta el efectivo</span>
      </button>
    ),
  ].filter(Boolean);

  if (acciones.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{acciones}</div>
      <VentaRapidaModal open={abierto === 'venta'} onOpenChange={(a) => setAbierto(a ? 'venta' : null)} />
      <VentaProductoModal open={abierto === 'producto'} onOpenChange={(a) => setAbierto(a ? 'producto' : null)} />
      <GastoRapidoModal open={abierto === 'gasto'} onOpenChange={(a) => setAbierto(a ? 'gasto' : null)} />
      <CerrarDiaModal open={abierto === 'cierre'} onOpenChange={(a) => setAbierto(a ? 'cierre' : null)} />
    </>
  );
}
