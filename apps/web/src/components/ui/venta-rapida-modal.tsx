"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useModoUso } from '@/hooks/use-modo-uso';
import { useSucursalActiva } from '@/hooks/use-sucursal-activa';
import { useDebounce } from '@/hooks/use-debounce';
import { useTenantStore } from '@/store/use-tenant-store';
import { apiGet, apiPost, unwrapList } from '@/lib/api-client';
import { Search, CheckCircle2, UserPlus, AlertTriangle, Clock } from 'lucide-react';

export interface ClienteVenta { id: string; nombre: string; numeroDocumento?: string | null; telefono?: string | null }
interface Plan { id: string; nombre: string; precio: string | number; tipoPlan: string; estado?: string; duracionDias?: number | null; cantidadSesiones?: number | null }
interface Promocion { id: string; nombre: string; estado?: string; porcentajeDescuento?: string | number | null; montoDescuentoFijo?: string | number | null; fechaInicio: string; fechaFin: string }
interface MembresiaCreada { id: string; montoFinal: string | number }
interface Cuenta { id: string; banco: string; numeroCuenta: string }

const FORMAS_DE_PAGO = [
  { valor: 'EFECTIVO', nombre: 'Efectivo' },
  { valor: 'QR', nombre: 'QR' },
  { valor: 'TARJETA', nombre: 'Tarjeta' },
  { valor: 'TRANSFERENCIA', nombre: 'Transferencia' },
];

const describirPlan = (p: Plan) =>
  p.tipoPlan === 'SESIONES' ? `${p.cantidadSesiones ?? 0} sesiones` : p.tipoPlan === 'VISITA' ? 'Pase de un día' : `${p.duracionDias ?? 30} días`;

const describirPromocion = (p: Promocion) =>
  p.porcentajeDescuento ? `${Number(p.porcentajeDescuento)}%` : `Bs. ${Number(p.montoDescuentoFijo ?? 0).toFixed(2)}`;

// Fecha de hoy en la hora local (toISOString daría la de UTC: de noche, mañana).
const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Única pantalla para vender o renovar una membresía (plan 11.3): cliente (o
 * alta rápida), plan en botones, forma de pago y "Cobrar". Se usa en
 * Membresías, en la ficha del cliente ("Renovar"), en los accesos directos
 * del Inicio y desde el semáforo rojo de Control de acceso.
 *
 * En modo simple no hace falta caja ni cuenta (el dinero va a "Efectivo del
 * gimnasio") y el único descuento es el manual. En intermedio y experto el
 * cobro exige un turno de caja abierto y una cuenta destino, y además se
 * puede aplicar una promoción, elegir la fecha de inicio, pagar con dos
 * formas o dejar la venta pendiente de pago.
 */
export function VentaRapidaModal({
  open,
  onOpenChange,
  clienteInicial,
  planIdInicial,
  formaPagoInicial,
  busquedaInicial,
  promocionIdInicial,
  reemplazaPendiente,
  onVendido,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteInicial?: ClienteVenta | null;
  planIdInicial?: string | null;
  formaPagoInicial?: string | null;
  busquedaInicial?: string;
  promocionIdInicial?: string | null;
  /** Se abre desde "Editar" de una venta pendiente: al guardar, la reemplaza. */
  reemplazaPendiente?: boolean;
  onVendido?: (cliente: ClienteVenta) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const { activeTenantId } = useTenantStore();
  const { esSimple } = useModoUso();
  const { sucursalId } = useSucursalActiva();

  const [busqueda, setBusqueda] = useState('');
  const [cliente, setCliente] = useState<ClienteVenta | null>(null);
  const [alta, setAlta] = useState<{ nombre: string; telefono: string; documento: string } | null>(null);
  const [planId, setPlanId] = useState('');
  const [formaPago, setFormaPago] = useState('EFECTIVO');
  const [cuentaId, setCuentaId] = useState('');
  const [conDescuento, setConDescuento] = useState(false);
  const [descuento, setDescuento] = useState('');
  const [promocionId, setPromocionId] = useState('');
  const [fechaInicio, setFechaInicio] = useState(hoyLocal());
  const [masOpciones, setMasOpciones] = useState(false);
  const [dividir, setDividir] = useState(false);
  const [pago2, setPago2] = useState({ formaPago: 'QR', monto: '', cuentaId: '' });
  const [recibido, setRecibido] = useState('');
  const busquedaDebounced = useDebounce(busqueda, 300);

  const { data: planesData } = useQuery({
    queryKey: ['planes', activeTenantId],
    queryFn: async () => unwrapList<Plan>(await apiGet('/planes')),
    enabled: !!token && open,
  });
  const planes = (planesData ?? []).filter((p) => !p.estado || p.estado === 'ACTIVO');

  // Solo las vigentes hoy: el servidor rechaza las demás al vender.
  const { data: promocionesData } = useQuery({
    queryKey: ['promociones', activeTenantId],
    queryFn: async () => unwrapList<Promocion>(await apiGet('/promociones')),
    enabled: !!token && open && !esSimple,
  });
  const ahora = Date.now();
  const promociones = (promocionesData ?? []).filter(
    (p) => (!p.estado || p.estado === 'ACTIVO') && new Date(p.fechaInicio).getTime() <= ahora && new Date(p.fechaFin).getTime() >= ahora,
  );

  // Fuera del modo simple el cobro necesita caja abierta y cuenta destino.
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
    setBusqueda(busquedaInicial ?? '');
    setCliente(clienteInicial ?? null);
    setAlta(null);
    setFormaPago(formaPagoInicial ?? 'EFECTIVO');
    setConDescuento(false);
    setDescuento('');
    setPromocionId(promocionIdInicial ?? '');
    setFechaInicio(hoyLocal());
    setMasOpciones(false);
    setDividir(false);
    setPago2({ formaPago: 'QR', monto: '', cuentaId: '' });
    setRecibido('');
  }, [open, clienteInicial, busquedaInicial, formaPagoInicial, promocionIdInicial]);

  useEffect(() => {
    if (!open) return;
    if (planIdInicial && planes.some((p) => p.id === planIdInicial)) setPlanId(planIdInicial);
    else setPlanId(planes.length === 1 ? planes[0].id : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planIdInicial, planesData]);

  useEffect(() => {
    if (open && cuentas && !cuentaId) setCuentaId(cuentas.length === 1 ? cuentas[0].id : '');
  }, [open, cuentas, cuentaId]);

  const { data: resultados = [] } = useQuery({
    queryKey: ['clientes-venta-rapida', busquedaDebounced],
    queryFn: async () => unwrapList<ClienteVenta>(await apiGet(`/clientes?search=${encodeURIComponent(busquedaDebounced)}&limit=6`)),
    enabled: open && !cliente && !alta && busquedaDebounced.trim().length >= 2,
  });

  const plan = planes.find((p) => p.id === planId);
  const promocion = promociones.find((p) => p.id === promocionId);
  const precio = plan ? Number(plan.precio) : 0;
  // Mismo cálculo que el servidor (membresia.service.ts#create).
  const descuentoPromocion = !promocion ? 0 : promocion.porcentajeDescuento
    ? (precio * Number(promocion.porcentajeDescuento)) / 100
    : Number(promocion.montoDescuentoFijo ?? 0);
  const montoDescuento = conDescuento ? Math.max(0, Number(descuento) || 0) : 0;
  const total = plan ? Math.max(0, precio - (promocion ? descuentoPromocion : montoDescuento)) : 0;
  const descuentoInvalido = !!plan && montoDescuento > precio;

  const montoPago2 = dividir ? Math.max(0, Number(pago2.monto) || 0) : 0;
  const pagoDivididoInvalido = dividir && (montoPago2 <= 0 || montoPago2 >= total || !pago2.cuentaId);
  const vuelto = !dividir && formaPago === 'EFECTIVO' && Number(recibido) > total ? Number(recibido) - total : 0;

  const faltaCaja = !esSimple && caja && !caja.abierta;
  const faltaCuenta = !esSimple && !cuentaId;
  const altaValida = !!alta && alta.nombre.trim().length >= 2;

  const vender = useMutation({
    mutationFn: async ({ cobrar }: { cobrar: boolean }) => {
      if (!plan) throw new Error('Elige el plan.');
      let elegido = cliente;
      if (!elegido && alta) {
        elegido = await apiPost<ClienteVenta>('/clientes', {
          nombre: alta.nombre.trim(),
          telefono: alta.telefono.trim() || undefined,
          numeroDocumento: alta.documento.trim() || undefined,
          ...(sucursalId ? { sucursalBaseId: sucursalId } : {}),
        });
        setCliente(elegido);
        setAlta(null);
      }
      if (!elegido) throw new Error('Elige el cliente.');
      const membresia = await apiPost<MembresiaCreada>('/membresias', {
        clienteId: elegido.id,
        planId: plan.id,
        ...(sucursalId ? { sucursalId } : {}),
        ...(promocion ? { promocionId: promocion.id } : {}),
        ...(!promocion && montoDescuento > 0 ? { descuentoManual: montoDescuento } : {}),
        ...(fechaInicio !== hoyLocal() ? { fechaInicio } : {}),
      });
      const monto = Number(membresia.montoFinal);
      if (!cobrar) return { monto, cliente: elegido, cobrada: false };

      const cuenta = (id: string) => (id && !esSimple ? { cuentaBancariaId: id } : {});
      const pagos = dividir
        ? [
            { metodoPago: formaPago, monto: Math.round((monto - montoPago2) * 100) / 100, ...cuenta(cuentaId) },
            { metodoPago: pago2.formaPago, monto: montoPago2, ...cuenta(pago2.cuentaId) },
          ]
        : [{ metodoPago: formaPago, monto, ...cuenta(cuentaId) }];
      try {
        await apiPost('/transacciones', {
          ...(sucursalId ? { sucursalId } : {}),
          clienteId: elegido.id,
          tipo: 'INGRESO',
          montoTotal: monto,
          detalles: [{ tipoConcepto: 'MEMBRESIA', membresiaId: membresia.id, cantidad: 1, precioUnitario: monto, subtotal: monto }],
          pagos,
        });
      } catch (err) {
        throw new Error(`La membresía quedó registrada pero no se pudo cobrar: ${(err as Error).message} Puedes cobrarla desde Membresías.`);
      }
      return { monto, cliente: elegido, cobrada: true };
    },
    onSuccess: ({ monto, cliente: vendido, cobrada }) => {
      queryClient.invalidateQueries({ queryKey: ['membresias'] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['ficha-cliente'] });
      queryClient.invalidateQueries({ queryKey: ['primeros-pasos'] });
      queryClient.invalidateQueries({ queryKey: ['cierre-dia'] });
      toast(
        cobrada
          ? { title: 'Venta registrada', description: `${vendido.nombre} ya tiene su membresía ${plan?.nombre} (Bs. ${monto.toFixed(2)}).`, variant: 'success' }
          : { title: 'Venta pendiente de pago', description: `La membresía de ${vendido.nombre} queda activa al cobrarla desde Membresías (Bs. ${monto.toFixed(2)}).`, variant: 'success' },
      );
      onVendido?.(vendido);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ['membresias'] });
      toast({ title: 'No se completó la venta', description: err.message, variant: 'destructive' });
    },
  });

  const chip = (activo: boolean) =>
    `rounded-lg border px-3 py-2 text-sm text-left transition-colors ${activo ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-900 dark:text-indigo-100' : 'border-zinc-200 dark:border-zinc-800 hover:border-indigo-300'}`;
  const selectClase = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
  const datosListos = (!!cliente || altaValida) && !!plan && !descuentoInvalido && !vender.isPending;
  const puedeCobrar = datosListos && !faltaCaja && !faltaCuenta && !pagoDivididoInvalido;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{reemplazaPendiente ? 'Cambiar venta pendiente' : clienteInicial && planIdInicial ? 'Renovar membresía' : 'Vender membresía'}</DialogTitle>
          <DialogDescription>Elige el cliente, el plan y cómo paga. Queda activa al cobrar.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {reemplazaPendiente && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/20 p-3 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Al guardar, la venta pendiente de este cliente se reemplaza por esta.</span>
            </p>
          )}

          {/* Cliente */}
          <div className="space-y-2">
            <Label htmlFor="venta-cliente">Cliente</Label>
            {cliente ? (
              <div className="flex items-center justify-between rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-500/20 px-3 py-2 text-sm">
                <span className="font-semibold text-indigo-900 dark:text-indigo-100">{cliente.nombre}</span>
                {!clienteInicial && (
                  <button type="button" onClick={() => setCliente(null)} className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:underline">Cambiar</button>
                )}
              </div>
            ) : alta ? (
              <div className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Cliente nuevo</p>
                  <button type="button" onClick={() => setAlta(null)} className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:underline">Buscar otro</button>
                </div>
                <Input autoFocus placeholder="Nombre y apellido" aria-label="Nombre del cliente nuevo" value={alta.nombre} onChange={(e) => setAlta({ ...alta, nombre: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Teléfono" aria-label="Teléfono" inputMode="tel" value={alta.telefono} onChange={(e) => setAlta({ ...alta, telefono: e.target.value })} />
                  <Input placeholder="Documento (opcional)" aria-label="Documento" value={alta.documento} onChange={(e) => setAlta({ ...alta, documento: e.target.value })} />
                </div>
                <p className="text-xs text-zinc-500">Se registra al cobrar. Los demás datos se completan después en Clientes.</p>
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
                <button
                  type="button"
                  onClick={() => setAlta({ nombre: /\d/.test(busqueda) ? '' : busqueda.trim(), telefono: /^\+?[\d\s-]{6,}$/.test(busqueda.trim()) ? busqueda.trim() : '', documento: '' })}
                  className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <UserPlus className="h-4 w-4" />
                  {busquedaDebounced.trim().length >= 2 && resultados.length === 0 ? `No está registrado: agregar a "${busqueda.trim()}"` : 'Cliente nuevo'}
                </button>
              </>
            )}
          </div>

          {/* Plan */}
          <div className="space-y-2">
            <Label>Plan</Label>
            {planes.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Todavía no hay planes. <Link href="/dashboard/planes" className="text-indigo-600 underline">Crea uno en Planes</Link>.
              </p>
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

            {/* Promoción (desde intermedio) o descuento manual: uno u otro. */}
            {plan && !conDescuento && promociones.length > 0 && (
              <select aria-label="Promoción" value={promocionId} onChange={(e) => setPromocionId(e.target.value)} className={selectClase}>
                <option value="">Sin promoción</option>
                {promociones.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {describirPromocion(p)}</option>)}
              </select>
            )}
            {plan && !promocion && (
              conDescuento ? (
                <div className="flex items-center gap-2">
                  <Label htmlFor="venta-descuento" className="text-sm whitespace-nowrap">Descuento Bs.</Label>
                  <Input id="venta-descuento" type="number" min={0} step="0.5" inputMode="decimal" value={descuento} onChange={(e) => setDescuento(e.target.value)} className="w-28" />
                  <button type="button" onClick={() => { setConDescuento(false); setDescuento(''); }} className="text-xs text-zinc-500 hover:underline">Quitar</button>
                </div>
              ) : (
                <button type="button" onClick={() => setConDescuento(true)} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">+ Aplicar un descuento</button>
              )
            )}
            {descuentoInvalido && <p className="text-xs text-rose-600">El descuento no puede ser mayor que el precio del plan.</p>}
          </div>

          {/* Pago */}
          <div className="space-y-2">
            <Label>{dividir ? 'Primera forma de pago' : 'Forma de pago'}</Label>
            <div className="flex flex-wrap gap-2">
              {FORMAS_DE_PAGO.map((f) => (
                <button key={f.valor} type="button" onClick={() => setFormaPago(f.valor)} className={chip(f.valor === formaPago)}>{f.nombre}</button>
              ))}
            </div>
            {!esSimple && (
              <select aria-label="Cuenta donde entra el dinero" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className={selectClase}>
                <option value="">¿A qué cuenta entra el dinero?</option>
                {(cuentas ?? []).map((c) => <option key={c.id} value={c.id}>{c.banco} · {c.numeroCuenta}</option>)}
              </select>
            )}

            {!dividir && formaPago === 'EFECTIVO' && plan && (
              <div className="flex items-center gap-2">
                <Label htmlFor="venta-recibido" className="text-sm whitespace-nowrap">Recibe Bs.</Label>
                <Input id="venta-recibido" type="number" min={0} step="0.5" inputMode="decimal" placeholder={total.toFixed(2)} value={recibido} onChange={(e) => setRecibido(e.target.value)} className="w-28" />
                {vuelto > 0 && <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Cambio: Bs. {vuelto.toFixed(2)}</span>}
              </div>
            )}

            {/* Pago con dos formas (desde intermedio). */}
            {!esSimple && plan && (
              dividir ? (
                <div className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Segunda forma de pago</p>
                    <button type="button" onClick={() => setDividir(false)} className="text-xs text-zinc-500 hover:underline">Quitar</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select aria-label="Segunda forma de pago" value={pago2.formaPago} onChange={(e) => setPago2({ ...pago2, formaPago: e.target.value })} className={selectClase}>
                      {FORMAS_DE_PAGO.map((f) => <option key={f.valor} value={f.valor}>{f.nombre}</option>)}
                    </select>
                    <Input aria-label="Monto de la segunda forma de pago" type="number" min={0} step="0.5" inputMode="decimal" placeholder="Monto Bs." value={pago2.monto} onChange={(e) => setPago2({ ...pago2, monto: e.target.value })} />
                  </div>
                  <select aria-label="Cuenta de la segunda forma de pago" value={pago2.cuentaId} onChange={(e) => setPago2({ ...pago2, cuentaId: e.target.value })} className={selectClase}>
                    <option value="">¿A qué cuenta entra?</option>
                    {(cuentas ?? []).map((c) => <option key={c.id} value={c.id}>{c.banco} · {c.numeroCuenta}</option>)}
                  </select>
                  <p className="text-xs text-zinc-500">
                    {montoPago2 > 0 && montoPago2 < total
                      ? `Con la primera forma se cobran Bs. ${(total - montoPago2).toFixed(2)}.`
                      : `El monto debe ser mayor que cero y menor que Bs. ${total.toFixed(2)}.`}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setDividir(true); setPago2({ formaPago: formaPago === 'EFECTIVO' ? 'QR' : 'EFECTIVO', monto: '', cuentaId: cuentas?.length === 1 ? cuentas[0].id : '' }); }}
                  className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  + Paga con dos formas
                </button>
              )
            )}
          </div>

          {/* Más opciones (desde intermedio): fecha de inicio. */}
          {!esSimple && (
            masOpciones ? (
              <div className="space-y-1">
                <Label htmlFor="venta-fecha">Empieza el</Label>
                <Input id="venta-fecha" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value || hoyLocal())} className="w-48" />
                <p className="text-xs text-zinc-500">Si tiene una membresía vigente, esta empieza cuando termine aquella.</p>
              </div>
            ) : (
              <button type="button" onClick={() => setMasOpciones(true)} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                + Elegir otra fecha de inicio
              </button>
            )
          )}

          {faltaCaja && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/20 p-3 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Para cobrar necesitas tu caja abierta. <Link href="/dashboard/cajas" className="font-semibold underline">Abrir caja</Link></span>
            </p>
          )}

          <div className="space-y-2">
            <Button className="w-full" size="lg" disabled={!puedeCobrar} onClick={() => vender.mutate({ cobrar: true })}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {vender.isPending ? 'Guardando...' : plan ? `Cobrar Bs. ${total.toFixed(2)}` : 'Cobrar'}
            </Button>
            {!esSimple && (
              <Button variant="outline" className="w-full" disabled={!datosListos} onClick={() => vender.mutate({ cobrar: false })}>
                <Clock className="w-4 h-4 mr-2" />
                Cobrar después
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
