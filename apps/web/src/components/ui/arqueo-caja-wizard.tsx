import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Banknote, Coins, ArrowRight, ArrowLeft, AlertTriangle, CheckCircle2, Save, X } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

interface ArqueoCajaWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { montoCierreReal: string; montoExtraido: string; observaciones: string }) => void;
  estadoApertura: any;
  isPending?: boolean;
}

const DENOMINACIONES = [
  { valor: 200, tipo: 'billete' },
  { valor: 100, tipo: 'billete' },
  { valor: 50, tipo: 'billete' },
  { valor: 20, tipo: 'billete' },
  { valor: 10, tipo: 'billete' },
  { valor: 5, tipo: 'moneda' },
  { valor: 2, tipo: 'moneda' },
  { valor: 1, tipo: 'moneda' },
  { valor: 0.5, tipo: 'moneda' },
  { valor: 0.2, tipo: 'moneda' },
  { valor: 0.1, tipo: 'moneda' },
];

const ArqueoSchema = z.object({
  montoExtraido: z.coerce.number().min(0, 'No puede ser negativo').default(0),
  observaciones: z.string().optional().default(''),
});

export function ArqueoCajaWizard({ isOpen, onClose, onSubmit, estadoApertura, isPending }: ArqueoCajaWizardProps) {
  const [step, setStep] = useState(1);
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  
  const form = useForm({
    resolver: zodResolver(ArqueoSchema),
    defaultValues: {
      montoExtraido: 0,
      observaciones: ''
    }
  });

  // Reset al abrir
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setCantidades({});
      form.reset();
    }
  }, [isOpen, form]);

  const totalEfectivoCalculado = useMemo(() => {
    return DENOMINACIONES.reduce((acc, denom) => {
      const cantidad = cantidades[denom.valor] || 0;
      return acc + (denom.valor * cantidad);
    }, 0);
  }, [cantidades]);

  const handleCantidadChange = (valor: number, cantidad: string) => {
    const num = parseInt(cantidad, 10) || 0;
    setCantidades(prev => ({ ...prev, [valor]: Math.max(0, num) }));
  };

  const montoEsperado = Number(estadoApertura?.apertura?.caja?.saldoActual || 0);
  const diferencia = totalEfectivoCalculado - montoEsperado;

  const nextStep = () => setStep(2);
  const prevStep = () => setStep(1);

  const handleSubmit = (values: any) => {
    onSubmit({
      montoCierreReal: totalEfectivoCalculado.toString(),
      montoExtraido: values.montoExtraido.toString(),
      observaciones: values.observaciones
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden bg-slate-50 border-0 shadow-2xl">
        {/* Cabecera */}
        <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center relative overflow-hidden">
          <div className="absolute -right-10 -top-10 opacity-10">
             <Banknote className="w-40 h-40" />
          </div>
          <div className="relative z-10 text-white flex-1">
            <h2 className="text-2xl font-bold">Arqueo y Cierre de Caja</h2>
            <p className="text-indigo-100 mt-1">Caja: {estadoApertura?.apertura?.caja?.nombre || 'Desconocida'}</p>
          </div>
        </div>

        {/* Stepper Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white">
          <div className="flex items-center justify-center gap-8">
             <div className={`flex items-center gap-2 ${step === 1 ? 'text-indigo-600 font-bold' : 'text-slate-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${step === 1 ? 'bg-indigo-100' : 'bg-slate-100'}`}>1</div>
                <span>Conteo Físico</span>
             </div>
             <div className="w-12 h-px bg-slate-200"></div>
             <div className={`flex items-center gap-2 ${step === 2 ? 'text-indigo-600 font-bold' : 'text-slate-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${step === 2 ? 'bg-indigo-100' : 'bg-slate-100'}`}>2</div>
                <span>Resumen y Ajustes</span>
             </div>
          </div>
        </div>

        {/* Formulario */}
        <div className="px-6 py-6 bg-white min-h-[400px]">
          {step === 1 && (
             <div className="animate-in fade-in slide-in-from-right-4 duration-300">
               <div className="mb-6">
                 <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                   <Coins className="w-5 h-5 text-indigo-500" />
                   Calculadora de Denominaciones
                 </h3>
                 <p className="text-sm text-slate-500">Ingresa la cantidad de billetes y monedas que tienes físicamente en la gaveta.</p>
               </div>
               
               <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[300px] overflow-y-auto p-1">
                 {DENOMINACIONES.map((denom) => (
                   <div key={denom.valor} className="flex flex-col gap-1.5 p-3 rounded-lg border border-slate-200 bg-slate-50 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 transition-all">
                     <Label className="text-xs text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-1">
                       {denom.tipo === 'billete' ? <Banknote className="w-3 h-3" /> : <Coins className="w-3 h-3" />}
                       Bs. {denom.valor}
                     </Label>
                     <Input 
                       type="number" 
                       min="0"
                       className="bg-white border-0 shadow-xs h-9 font-bold text-center"
                       placeholder="0"
                       value={cantidades[denom.valor] === undefined ? '' : cantidades[denom.valor]}
                       onChange={(e) => handleCantidadChange(denom.valor, e.target.value)}
                     />
                   </div>
                 ))}
               </div>

               <div className="mt-8 pt-4 border-t border-slate-200 flex justify-between items-center">
                 <div>
                   <p className="text-sm font-medium text-slate-500">Total Efectivo Contado</p>
                   <p className="text-3xl font-black text-emerald-600">Bs. {totalEfectivoCalculado.toFixed(2)}</p>
                 </div>
                 <Button onClick={nextStep} className="bg-indigo-600 hover:bg-indigo-700 h-12 px-6 rounded-full shadow-md shadow-indigo-200">
                   Siguiente <ArrowRight className="w-4 h-4 ml-2" />
                 </Button>
               </div>
             </div>
          )}

          {step === 2 && (
             <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-6">
                
                {/* Comparación */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                    <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Monto Esperado (Sistema)</p>
                    <p className="text-xl font-bold text-slate-700">Bs. {montoEsperado.toFixed(2)}</p>
                  </div>
                  <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 text-center">
                    <p className="text-xs text-emerald-700 font-semibold uppercase mb-1">Monto Físico Contado</p>
                    <p className="text-xl font-bold text-emerald-700">Bs. {totalEfectivoCalculado.toFixed(2)}</p>
                  </div>
                  <div className={`p-4 rounded-xl border text-center ${Math.abs(diferencia) < 0.01 ? 'bg-slate-100 border-slate-200' : diferencia < 0 ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
                    <p className={`text-xs font-semibold uppercase mb-1 ${Math.abs(diferencia) < 0.01 ? 'text-slate-500' : diferencia < 0 ? 'text-rose-700' : 'text-amber-700'}`}>
                       Descuadre
                    </p>
                    <div className="flex items-center justify-center gap-1.5">
                       {Math.abs(diferencia) > 0.01 && <AlertTriangle className={`w-5 h-5 ${diferencia < 0 ? 'text-rose-500' : 'text-amber-500'}`} />}
                       {Math.abs(diferencia) <= 0.01 && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                       <p className={`text-xl font-bold ${Math.abs(diferencia) < 0.01 ? 'text-slate-700' : diferencia < 0 ? 'text-rose-700' : 'text-amber-700'}`}>
                         {diferencia > 0 ? '+' : ''}{diferencia.toFixed(2)}
                       </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="font-semibold text-slate-700">Dinero a Retirar a Bóveda (Bs.)</Label>
                    <p className="text-xs text-slate-500 mb-2">Si vas a extraer dinero para dejar un saldo inicial menor para el próximo turno, ingrésalo aquí.</p>
                    <Input 
                      type="number" 
                      step="0.01" 
                      min="0"
                      {...form.register('montoExtraido')} 
                      className="text-lg py-6"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="font-semibold text-slate-700">Observaciones</Label>
                    <p className="text-xs text-slate-500 mb-2">Si existe un descuadre (faltante o sobrante), es obligatorio dejar un comentario explicando el motivo.</p>
                    <textarea 
                      {...form.register('observaciones')} 
                      className="flex min-h-[80px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="Ej: Faltaron 5 Bs de cambio, el cliente quedó en traerlos mañana..."
                    />
                  </div>

                  <div className="mt-8 pt-4 border-t border-slate-200 flex justify-between items-center">
                    <Button type="button" variant="ghost" onClick={prevStep} className="text-slate-500 hover:text-slate-700">
                      <ArrowLeft className="w-4 h-4 mr-2" /> Volver al Conteo
                    </Button>
                    <Button type="submit" disabled={isPending} className="bg-rose-600 hover:bg-rose-700 text-white h-12 px-8 rounded-full shadow-md shadow-rose-200 font-bold text-base">
                      {isPending ? 'Cerrando...' : 'Confirmar Cierre de Caja'} <Save className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </form>
             </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
