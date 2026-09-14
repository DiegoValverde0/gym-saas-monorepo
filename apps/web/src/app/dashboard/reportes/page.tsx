"use client";

import { useQuery } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, unwrapList } from '@/lib/api-client';
import { Protect } from '@/components/ui/protect';
import { FileText, TrendingUp, DollarSign, CreditCard, Smartphone } from 'lucide-react';
import { useMemo } from 'react';

export default function ReportesPage() {
  const { activeTenantId } = useTenantStore();
  const { token } = useAuth();

  const { data: transacciones, isLoading } = useQuery({
    queryKey: ['transacciones', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/transacciones')),
    enabled: !!token,
  });

  const { totalHoy, efectivoHoy, digitalHoy } = useMemo(() => {
    const list = Array.isArray(transacciones) ? transacciones : [];
    
    // Filtrar solo transacciones de HOY
    const hoy = new Date().toISOString().split('T')[0];
    const transaccionesHoy = list.filter((t: any) => t.fechaHora.startsWith(hoy) && t.tipo === 'INGRESO');

    let total = 0;
    let efectivo = 0;
    let digital = 0;

    transaccionesHoy.forEach((t: any) => {
        t.pagos?.forEach((p: any) => {
            const val = Number(p.monto);
            total += val;
            if (p.metodoPago === 'EFECTIVO') {
                efectivo += val;
            } else {
                digital += val;
            }
        });
    });

    return { totalHoy: total, efectivoHoy: efectivo, digitalHoy: digital };
  }, [transacciones]);

  return (
    <Protect permission="transacciones:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <FileText className="w-8 h-8 text-indigo-600" />
            Reportes Financieros (Hoy)
          </h2>
          <p className="text-zinc-500 mt-1">Resumen de ingresos del día actual.</p>
        </div>

        {isLoading ? (
            <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Ingreso Total */}
                <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col justify-between overflow-hidden relative group">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-indigo-50 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out -z-10" />
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-1">Ingreso Total Hoy</p>
                        <h3 className="text-4xl font-black text-indigo-900">
                            <span className="text-indigo-400 mr-1">Bs.</span>
                            {totalHoy.toFixed(2)}
                        </h3>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-sm text-indigo-600 font-medium">
                        <TrendingUp className="w-4 h-4" />
                        <span>Monitoreo en tiempo real</span>
                    </div>
                </div>

                {/* Efectivo */}
                <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col justify-between overflow-hidden relative group">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-50 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out -z-10" />
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-1">Efectivo en Caja</p>
                        <h3 className="text-4xl font-black text-emerald-900">
                            <span className="text-emerald-400 mr-1">Bs.</span>
                            {efectivoHoy.toFixed(2)}
                        </h3>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-sm text-emerald-600 font-medium">
                        <DollarSign className="w-4 h-4" />
                        <span>Físico recibido en gaveta</span>
                    </div>
                </div>

                {/* Digital */}
                <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col justify-between overflow-hidden relative group">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-sky-50 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out -z-10" />
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-1">Depósitos Bancarios (QR/Transfer)</p>
                        <h3 className="text-4xl font-black text-sky-900">
                            <span className="text-sky-400 mr-1">Bs.</span>
                            {digitalHoy.toFixed(2)}
                        </h3>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-sm text-sky-600 font-medium">
                        <Smartphone className="w-4 h-4" />
                        <CreditCard className="w-4 h-4" />
                        <span>Abonos directos a cuenta</span>
                    </div>
                </div>

            </div>
        )}
      </div>
    </Protect>
  );
}
