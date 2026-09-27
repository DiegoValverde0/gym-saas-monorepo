"use client";

import { useState } from 'react';
import { useListaPaginada } from '@/hooks/use-lista-paginada';
import { useSucursalActiva } from '@/hooks/use-sucursal-activa';
import { Paginacion } from '@/components/ui/paginacion';
import { Protect } from '@/components/ui/protect';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Banknote, FileText, ArrowDownLeft, ArrowUpRight, Eye, Search } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { bs, fechaISO, NOMBRE_CONCEPTO, NOMBRE_PAGO } from '@/lib/formato';

interface TransaccionDetalle {
  id: string;
  tipoConcepto: string;
  descripcionLibre?: string;
  subtotal: number | string;
  cantidad: number;
  precioUnitario: number | string;
  membresia?: { plan?: { nombre: string } } | null;
  producto?: { nombre: string } | null;
}

interface TransaccionPago {
  id: string;
  metodoPago: string;
  cuentaBancaria?: { banco: string; numeroCuenta: string };
  monto: number | string;
}

interface Transaccion {
  id: string;
  tipo: string;
  fechaHora: string;
  montoTotal: number | string;
  beneficiario?: string | null;
  cliente?: { nombre: string } | null;
  proveedor?: { nombre: string } | null;
  sucursal?: { nombre: string };
  detalles?: TransaccionDetalle[];
  pagos?: TransaccionPago[];
  creadoPor?: { nombreCompleto: string };
}

type Periodo = 'hoy' | 'semana' | 'mes' | 'todo' | 'fechas';
type Tipo = 'todos' | 'INGRESO' | 'EGRESO';

const PERIODOS: { valor: Periodo; nombre: string }[] = [
  { valor: 'hoy', nombre: 'Hoy' },
  { valor: 'semana', nombre: 'Esta semana' },
  { valor: 'mes', nombre: 'Este mes' },
  { valor: 'todo', nombre: 'Todo' },
  { valor: 'fechas', nombre: 'Elegir fechas' },
];

const TIPOS: { valor: Tipo; nombre: string }[] = [
  { valor: 'todos', nombre: 'Todo' },
  { valor: 'INGRESO', nombre: 'Cobros' },
  { valor: 'EGRESO', nombre: 'Gastos' },
];

// Rango de fechas locales; el servidor las interpreta en la zona horaria de la organización.
function rangoDe(periodo: Periodo): { desde?: string; hasta?: string } {
  const hoy = new Date();
  if (periodo === 'hoy') return { desde: fechaISO(hoy), hasta: fechaISO(hoy) };
  if (periodo === 'semana') {
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    return { desde: fechaISO(lunes), hasta: fechaISO(hoy) };
  }
  if (periodo === 'mes') return { desde: fechaISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: fechaISO(hoy) };
  return {};
}

// Quién pagó o a quién se le pagó.
const quien = (t: Transaccion) =>
  t.tipo === 'INGRESO'
    ? t.cliente?.nombre || 'Venta sin cliente'
    : t.proveedor?.nombre || t.beneficiario || 'Gasto sin beneficiario';

const conceptoDe = (d: TransaccionDetalle) =>
  d.membresia?.plan?.nombre || d.producto?.nombre || d.descripcionLibre || NOMBRE_CONCEPTO[d.tipoConcepto] || d.tipoConcepto;

const concepto = (t: Transaccion) => {
  const detalles = t.detalles ?? [];
  if (detalles.length === 0) return '-';
  const primero = conceptoDe(detalles[0]);
  return detalles.length > 1 ? `${primero} y ${detalles.length - 1} más` : primero;
};

const formasDePago = (t: Transaccion) =>
  [...new Set((t.pagos ?? []).map((p) => NOMBRE_PAGO[p.metodoPago] ?? p.metodoPago))].join(' + ') || '-';

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const chip = (activo: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
    activo
      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
      : 'border-slate-200 text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:text-slate-300'
  }`;

export default function TransaccionesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [fechas, setFechas] = useState(() => rangoDe('mes') as { desde: string; hasta: string });
  const [tipo, setTipo] = useState<Tipo>('todos');
  const [todas, setTodas] = useState(false);
  const [detalle, setDetalle] = useState<Transaccion | null>(null);
  // Por defecto, la sucursal activa de la barra superior (como Reportes).
  const { sucursalId, sucursal, puedeElegir } = useSucursalActiva();

  const rango = periodo === 'fechas' ? fechas : rangoDe(periodo);
  const lista = useListaPaginada<Transaccion>({
    entidad: 'transacciones',
    ruta: '/transacciones',
    busqueda: searchTerm,
    filtros: {
      ...rango,
      tipo: tipo === 'todos' ? undefined : tipo,
      sucursalId: todas ? undefined : sucursalId ?? undefined,
    },
  });
  const resumen = lista.respuesta?.resumen as { ingresos: number; egresos: number } | undefined;
  const filtrando = lista.buscando || periodo !== 'todo' || tipo !== 'todos';

  return (
    <Protect permission="transacciones:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Transacciones</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Todos los cobros y gastos del gimnasio, uno por uno.</p>
          </div>
          {puedeElegir && (
            <div className="flex gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1 text-xs font-medium" role="group" aria-label="Sucursal">
              <button type="button" aria-pressed={!todas} onClick={() => setTodas(false)} className={`rounded-md px-3 py-1.5 ${!todas ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'}`}>
                {sucursal?.nombre ?? 'Esta sucursal'}
              </button>
              <button type="button" aria-pressed={todas} onClick={() => setTodas(true)} className={`rounded-md px-3 py-1.5 ${todas ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'}`}>
                Todas las sucursales
              </button>
            </div>
          )}
        </div>

        {/* Filtros */}
        <div className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Período">
              {PERIODOS.map((p) => (
                <button key={p.valor} type="button" aria-pressed={periodo === p.valor} onClick={() => setPeriodo(p.valor)} className={chip(periodo === p.valor)}>
                  {p.nombre}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo">
                {TIPOS.map((t) => (
                  <button key={t.valor} type="button" aria-pressed={tipo === t.valor} onClick={() => setTipo(t.valor)} className={chip(tipo === t.valor)}>
                    {t.nombre}
                  </button>
                ))}
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  placeholder="Buscar cliente o proveedor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 shadow-xs"
                />
              </div>
            </div>
          </div>
          {periodo === 'fechas' && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <span>Del</span>
              <Input type="date" aria-label="Desde" value={fechas.desde} max={fechas.hasta} onChange={(e) => e.target.value && setFechas({ ...fechas, desde: e.target.value })} className="w-44" />
              <span>al</span>
              <Input type="date" aria-label="Hasta" value={fechas.hasta} min={fechas.desde} onChange={(e) => e.target.value && setFechas({ ...fechas, hasta: e.target.value })} className="w-44" />
            </div>
          )}
        </div>

        {/* Totales del período y filtros elegidos (sin contar el filtro de tipo). */}
        {resumen && (
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Total titulo="Cobrado" valor={bs(resumen.ingresos)} clase="text-emerald-600 dark:text-emerald-400" />
            <Total titulo="Gastado" valor={bs(resumen.egresos)} clase="text-rose-600 dark:text-rose-400" />
            <Total
              titulo="Queda"
              valor={bs(resumen.ingresos - resumen.egresos)}
              clase={resumen.ingresos - resumen.egresos < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}
            />
          </div>
        )}

        {lista.cargando ? (
          <TableSkeleton columns={6} showAvatar={true} />
        ) : lista.items.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title={filtrando ? 'No hay movimientos con estos filtros' : 'Todavía no hay movimientos'}
            description={filtrando ? 'Prueba con otro período, tipo o nombre.' : 'Los cobros de membresías y productos y los gastos aparecen aquí.'}
            isSearch
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quién</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead>Fecha</TableHead>
                {todas && <TableHead>Sucursal</TableHead>}
                <TableHead>Forma de pago</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right"><span className="sr-only">Ver</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.items.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${t.tipo === 'INGRESO' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400'}`}>
                        {t.tipo === 'INGRESO' ? <ArrowDownLeft className="h-4 w-4" aria-label="Cobro" /> : <ArrowUpRight className="h-4 w-4" aria-label="Gasto" />}
                      </div>
                      <p className="font-semibold text-slate-900 dark:text-white text-sm">{quien(t)}</p>
                    </div>
                  </TableCell>
                  <TableCell><span className="text-xs text-slate-600 dark:text-slate-400">{concepto(t)}</span></TableCell>
                  <TableCell><span className="text-xs text-slate-600 dark:text-slate-400">{fechaHora(t.fechaHora)}</span></TableCell>
                  {todas && <TableCell><span className="text-xs text-slate-600 dark:text-slate-400">{t.sucursal?.nombre ?? '-'}</span></TableCell>}
                  <TableCell><span className="text-xs text-slate-600 dark:text-slate-400">{formasDePago(t)}</span></TableCell>
                  <TableCell className="text-right">
                    <span className={`font-bold tabular-nums ${t.tipo === 'INGRESO' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {t.tipo === 'INGRESO' ? '+' : '-'} {bs(Number(t.montoTotal))}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" aria-label="Ver detalle" onClick={() => setDetalle(t)} className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Paginacion
          pagina={lista.pagina}
          totalPaginas={lista.totalPaginas}
          total={lista.total}
          porPagina={lista.porPagina}
          onCambiar={lista.setPagina}
          nombre={['movimiento', 'movimientos']}
          actualizando={lista.actualizando}
        />

        <Dialog open={!!detalle} onOpenChange={(open) => !open && setDetalle(null)}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{detalle?.tipo === 'EGRESO' ? 'Detalle del gasto' : 'Detalle del cobro'}</DialogTitle>
              <DialogDescription>
                {detalle && `${quien(detalle)} · ${new Date(detalle.fechaHora).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}${detalle.sucursal ? ` · ${detalle.sucursal.nombre}` : ''}`}
              </DialogDescription>
            </DialogHeader>

            {detalle && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Qué se {detalle.tipo === 'EGRESO' ? 'pagó' : 'cobró'}</h4>
                  <div className="space-y-2">
                    {detalle.detalles?.map((d) => (
                      <div key={d.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-white dark:bg-slate-900 shadow-xs flex items-center justify-center border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{conceptoDe(d)}</p>
                            {conceptoDe(d) !== NOMBRE_CONCEPTO[d.tipoConcepto] && (
                              <p className="text-[10px] text-slate-500 dark:text-slate-400">{NOMBRE_CONCEPTO[d.tipoConcepto] ?? d.tipoConcepto}</p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{bs(Number(d.subtotal))}</p>
                          {d.cantidad > 1 && <p className="text-[10px] text-slate-500 dark:text-slate-400">{d.cantidad} x {bs(Number(d.precioUnitario))}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Cómo se pagó</h4>
                  <div className="space-y-2">
                    {detalle.pagos?.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-indigo-50/50 dark:bg-indigo-500/20 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900/50">
                        <div>
                          <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{NOMBRE_PAGO[p.metodoPago] ?? p.metodoPago}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {p.cuentaBancaria ? `${p.cuentaBancaria.banco} · ${p.cuentaBancaria.numeroCuenta}` : 'Efectivo del gimnasio'}
                          </p>
                        </div>
                        <div className="text-right font-black text-indigo-900 dark:text-indigo-100">{bs(Number(p.monto))}</div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Registrado por</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{detalle.creadoPor?.nombreCompleto || 'Sistema'}</span>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Protect>
  );
}

function Total({ titulo, valor, clase }: { titulo: string; valor: string; clase: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 sm:px-4 sm:py-3">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{titulo}</p>
      <p className={`text-sm sm:text-xl font-bold tabular-nums ${clase}`}>{valor}</p>
    </div>
  );
}
