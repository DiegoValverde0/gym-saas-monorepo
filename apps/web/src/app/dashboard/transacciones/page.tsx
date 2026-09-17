"use client";

import { useQuery } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, unwrapList } from '@/lib/api-client';
import { Protect } from '@/components/ui/protect';
import { Banknote, FileText, ArrowDownLeft, ArrowUpRight, Eye, Search } from 'lucide-react';
import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface TransaccionDetalle {
  id: string;
  tipoConcepto: string;
  descripcionLibre?: string;
  subtotal: number | string;
  cantidad: number;
  precioUnitario: number | string;
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
  cliente?: { nombre: string };
  sucursal?: { nombre: string };
  detalles?: TransaccionDetalle[];
  pagos?: TransaccionPago[];
  creadoPor?: { nombreCompleto: string };
}

export default function TransaccionesPage() {
  const { activeTenantId } = useTenantStore();
  const { token } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [detalle, setDetalle] = useState<Transaccion | null>(null);

  const { data: transacciones, isLoading } = useQuery({
    queryKey: ['transacciones', activeTenantId],
    queryFn: async () => unwrapList<Transaccion>(await apiGet('/transacciones')),
    enabled: !!token,
  });

  const list = Array.isArray(transacciones) ? transacciones : [];

  const filteredList = list.filter((t: Transaccion) => {
    if (!searchTerm) return true;
    const lower = searchTerm.toLowerCase();
    const cliName = t.cliente?.nombre?.toLowerCase() || '';
    return cliName.includes(lower);
  });

  return (
    <Protect permission="transacciones:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Historial de Transacciones</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Monitorea todos los ingresos y egresos de la organización.</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 shadow-xs"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-8 flex justify-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
              <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded"></div>
            </div>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-full flex items-center justify-center mb-4">
              <Banknote className="w-6 h-6" />
            </div>
            <p className="text-base font-semibold text-slate-900 dark:text-white">
              {searchTerm ? 'Ninguna transacción coincide con la búsqueda' : 'No hay transacciones registradas'}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {searchTerm ? 'Prueba con otro cliente.' : 'Las ventas y cobros aparecerán aquí.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredList.map((t: Transaccion) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${t.tipo === 'INGRESO' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400'}`}>
                        {t.tipo === 'INGRESO' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </div>
                      <p className="font-semibold text-slate-900 dark:text-white text-sm">{t.cliente?.nombre || 'Cliente Mostrador'}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600 dark:text-slate-400">{new Date(t.fechaHora).toLocaleString()}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600 dark:text-slate-400">{t.sucursal?.nombre || 'Central'}</span>
                  </TableCell>
                  <TableCell>
                    {t.tipo === 'INGRESO' ? <Badge variant="success">Ingreso</Badge> : <Badge variant="destructive">Egreso</Badge>}
                  </TableCell>
                  <TableCell>
                    <span className={`font-bold ${t.tipo === 'INGRESO' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      Bs. {Number(t.montoTotal).toFixed(2)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setDetalle(t)} className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={!!detalle} onOpenChange={(open) => !open && setDetalle(null)}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Detalle de Transacción</DialogTitle>
              <DialogDescription>
                {detalle?.cliente?.nombre || 'Cliente Mostrador'} · {detalle && new Date(detalle.fechaHora).toLocaleString()}
              </DialogDescription>
            </DialogHeader>

            {detalle && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Conceptos Facturados</h4>
                  <div className="space-y-2">
                    {detalle.detalles?.map((d: TransaccionDetalle) => (
                      <div key={d.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-white dark:bg-slate-900 shadow-xs flex items-center justify-center border text-slate-400 dark:text-slate-500">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{d.tipoConcepto}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">{d.descripcionLibre || 'Item general'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-slate-900 dark:text-white">Bs. {Number(d.subtotal).toFixed(2)}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">{d.cantidad} x Bs. {Number(d.precioUnitario).toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Métodos de Pago</h4>
                  <div className="space-y-2">
                    {detalle.pagos?.map((p: TransaccionPago) => (
                      <div key={p.id} className="flex items-center justify-between bg-indigo-50/50 dark:bg-indigo-500/20 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900/50">
                        <div>
                          <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{p.metodoPago}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {p.cuentaBancaria ? `${p.cuentaBancaria.banco} - ${p.cuentaBancaria.numeroCuenta}` : 'Caja Física'}
                          </p>
                        </div>
                        <div className="text-right font-black text-indigo-900 dark:text-indigo-100">
                          Bs. {Number(p.monto).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 mt-4 border-t flex justify-between items-center text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Atendido por:</span>
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
