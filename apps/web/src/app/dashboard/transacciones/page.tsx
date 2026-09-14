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

export default function TransaccionesPage() {
  const { activeTenantId } = useTenantStore();
  const { token } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [detalle, setDetalle] = useState<any | null>(null);

  const { data: transacciones, isLoading } = useQuery({
    queryKey: ['transacciones', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/transacciones')),
    enabled: !!token,
  });

  const list = Array.isArray(transacciones) ? transacciones : [];

  const filteredList = list.filter((t: any) => {
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
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Historial de Transacciones</h2>
            <p className="text-sm text-slate-500 mt-1">Monitorea todos los ingresos y egresos de la organización.</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-xs"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-8 flex justify-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-8 w-8 bg-slate-200 rounded-full"></div>
              <div className="h-4 w-32 bg-slate-200 rounded"></div>
            </div>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
              <Banknote className="w-6 h-6" />
            </div>
            <p className="text-base font-semibold text-slate-900">
              {searchTerm ? 'Ninguna transacción coincide con la búsqueda' : 'No hay transacciones registradas'}
            </p>
            <p className="text-sm text-slate-500 mt-1">
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
              {filteredList.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${t.tipo === 'INGRESO' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                        {t.tipo === 'INGRESO' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </div>
                      <p className="font-semibold text-slate-900 text-sm">{t.cliente?.nombre || 'Cliente Mostrador'}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600">{new Date(t.fechaHora).toLocaleString()}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600">{t.sucursal?.nombre || 'Central'}</span>
                  </TableCell>
                  <TableCell>
                    {t.tipo === 'INGRESO' ? <Badge variant="success">Ingreso</Badge> : <Badge variant="destructive">Egreso</Badge>}
                  </TableCell>
                  <TableCell>
                    <span className={`font-bold ${t.tipo === 'INGRESO' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      Bs. {Number(t.montoTotal).toFixed(2)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setDetalle(t)} className="text-slate-500 hover:text-indigo-600">
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
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Conceptos Facturados</h4>
                  <div className="space-y-2">
                    {detalle.detalles?.map((d: any) => (
                      <div key={d.id} className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-white shadow-xs flex items-center justify-center border text-slate-400">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-700">{d.tipoConcepto}</p>
                            <p className="text-[10px] text-slate-500">{d.descripcionLibre || 'Item general'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-slate-900">Bs. {Number(d.subtotal).toFixed(2)}</p>
                          <p className="text-[10px] text-slate-500">{d.cantidad} x Bs. {Number(d.precioUnitario).toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Métodos de Pago</h4>
                  <div className="space-y-2">
                    {detalle.pagos?.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-100">
                        <div>
                          <p className="text-sm font-bold text-indigo-700">{p.metodoPago}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {p.cuentaBancaria ? `${p.cuentaBancaria.banco} - ${p.cuentaBancaria.numeroCuenta}` : 'Caja Física'}
                          </p>
                        </div>
                        <div className="text-right font-black text-indigo-900">
                          Bs. {Number(p.monto).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 mt-4 border-t flex justify-between items-center text-sm">
                    <span className="text-slate-500">Atendido por:</span>
                    <span className="font-semibold text-slate-700">{detalle.creadoPor?.nombreCompleto || 'Sistema'}</span>
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
