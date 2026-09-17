"use client";

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, CheckCircle2, ChevronRight, ChevronLeft, CreditCard } from 'lucide-react';

export const membresiaWizardSchema = z.object({
  clienteId: z.string().min(1, 'Debes seleccionar un cliente'),
  sucursalId: z.string().optional(),
  planId: z.string().min(1, 'Debes seleccionar un plan'),
  promocionId: z.string().optional(),
  fechaInicio: z.string().optional(),
});

type MembresiaWizardValues = z.infer<typeof membresiaWizardSchema>;

interface MembresiaWizardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: MembresiaWizardValues) => void;
  isPending: boolean;
  clientes: any[];
  planes: any[];
  promociones: any[];
  sucursales?: any[];
  userSucursalId?: string;
}

export function MembresiaWizardModal({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  clientes,
  planes,
  promociones,
  sucursales,
  userSucursalId,
}: MembresiaWizardModalProps) {
  const [step, setStep] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

  const form = useForm<MembresiaWizardValues>({
    resolver: zodResolver(membresiaWizardSchema),
    defaultValues: {
      clienteId: '',
      planId: '',
      promocionId: '',
      fechaInicio: new Date().toISOString().split('T')[0],
      sucursalId: userSucursalId || '',
    },
  });

  const { watch, setValue, trigger } = form;
  const watchClienteId = watch('clienteId');
  const watchPlanId = watch('planId');
  const watchPromoId = watch('promocionId');

  const filteredClientes = clientes.filter(c => 
    c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (c.numeroDocumento && c.numeroDocumento.includes(searchTerm))
  ).slice(0, 30);

  const selectedPlan = planes.find(p => p.id === watchPlanId);
  const selectedPromo = promociones.find(p => p.id === watchPromoId);

  const nextStep = async () => {
    let isValid = false;
    if (step === 1) {
      isValid = await trigger(['clienteId']);
    } else if (step === 2) {
      isValid = await trigger(['planId', 'sucursalId']);
    }
    if (isValid) setStep(step + 1);
  };

  const prevStep = () => setStep(step - 1);

  const handleSubmit = (values: MembresiaWizardValues) => {
    if (values.promocionId === 'none') {
       values.promocionId = undefined;
    }
    onSubmit(values);
  };

  // Preview logic
  const previewMontoBase = selectedPlan ? Number(selectedPlan.precio) : 0;
  let previewDescuento = 0;
  if (selectedPlan && selectedPromo && selectedPromo.id !== 'none') {
      if (selectedPromo.porcentajeDescuento) {
          previewDescuento = (previewMontoBase * Number(selectedPromo.porcentajeDescuento)) / 100;
      } else if (selectedPromo.montoDescuentoFijo) {
          previewDescuento = Number(selectedPromo.montoDescuentoFijo);
      }
  }
  let previewMontoFinal = previewMontoBase - previewDescuento;
  if (previewMontoFinal < 0) previewMontoFinal = 0;

  return (
    <Dialog open={open} onOpenChange={(val) => {
        if(!val) {
            setStep(1);
            form.reset();
        }
        onOpenChange(val);
    }}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
            <div>
                <DialogTitle className="text-xl">Vender Membresía</DialogTitle>
                <DialogDescription className="mt-1">
                    Sigue los pasos para procesar una nueva suscripción.
                </DialogDescription>
            </div>
            <div className="flex gap-2">
                <div className={`w-3 h-3 rounded-full ${step >= 1 ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
                <div className={`w-3 h-3 rounded-full ${step >= 2 ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
                <div className={`w-3 h-3 rounded-full ${step >= 3 ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
            </div>
        </div>

        <div className="p-6">
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                
                {/* Paso 1: Cliente */}
                {step === 1 && (
                    <div className="space-y-4 animate-in slide-in-from-right-4">
                        <h3 className="font-semibold text-lg">Paso 1: Seleccionar Cliente</h3>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                            <Input 
                                placeholder="Buscar por nombre o documento..." 
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="max-h-[300px] overflow-y-auto border rounded-md divide-y">
                            {filteredClientes.length === 0 && (
                                <div className="p-4 text-center text-slate-500">No se encontraron clientes.</div>
                            )}
                            {filteredClientes.map(c => (
                                <div 
                                    key={c.id} 
                                    onClick={() => setValue('clienteId', c.id, { shouldValidate: true })}
                                    className={`p-3 cursor-pointer hover:bg-indigo-50 transition-colors flex justify-between items-center ${watchClienteId === c.id ? 'bg-indigo-50 border-l-4 border-indigo-600' : ''}`}
                                >
                                    <div>
                                        <p className="font-medium text-slate-900">{c.nombre}</p>
                                        <p className="text-xs text-slate-500">{c.numeroDocumento || 'Sin doc'}</p>
                                    </div>
                                    {watchClienteId === c.id && <CheckCircle2 className="w-5 h-5 text-indigo-600" />}
                                </div>
                            ))}
                        </div>
                        {form.formState.errors.clienteId && <p className="text-sm text-red-500">{form.formState.errors.clienteId.message}</p>}
                    </div>
                )}

                {/* Paso 2: Plan y Configuración */}
                {step === 2 && (
                    <div className="space-y-6 animate-in slide-in-from-right-4">
                        <h3 className="font-semibold text-lg">Paso 2: Elegir Plan</h3>
                        
                        {!userSucursalId && sucursales && (
                            <div className="space-y-2">
                                <Label>Sucursal (Requerido para SuperAdmin)</Label>
                                <select 
                                  {...form.register('sucursalId')}
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                >
                                    <option value="">Selecciona una sucursal</option>
                                    {sucursales.map(s => (
                                        <option key={s.id} value={s.id}>{s.nombre}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Plan de Membresía</Label>
                            <div className="grid grid-cols-1 gap-2 max-h-[180px] overflow-y-auto pr-1">
                                {planes.map(p => (
                                    <div 
                                        key={p.id}
                                        onClick={() => setValue('planId', p.id, { shouldValidate: true })}
                                        className={`p-3 rounded-lg border cursor-pointer flex justify-between items-center transition-all ${watchPlanId === p.id ? 'bg-indigo-50 border-indigo-600 ring-1 ring-indigo-600' : 'hover:border-slate-300'}`}
                                    >
                                        <div>
                                            <p className="font-bold text-slate-900">{p.nombre}</p>
                                            <p className="text-sm text-slate-500">{p.duracionDias} días</p>
                                        </div>
                                        <p className="font-bold text-lg text-indigo-700">${Number(p.precio).toFixed(2)}</p>
                                    </div>
                                ))}
                            </div>
                            {form.formState.errors.planId && <p className="text-sm text-red-500">{form.formState.errors.planId.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label>Promoción Aplicable (Opcional)</Label>
                            <select 
                                {...form.register('promocionId')}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                <option value="none">Ninguna</option>
                                {promociones.map(p => (
                                    <option key={p.id} value={p.id}>{p.nombre}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <Label>Fecha de Inicio Deseada</Label>
                            <Input type="date" {...form.register('fechaInicio')} />
                            <p className="text-xs text-slate-500">Si tiene membresía activa, se encolará al final de la misma automáticamente.</p>
                        </div>
                    </div>
                )}

                {/* Paso 3: Resumen */}
                {step === 3 && (
                    <div className="space-y-6 animate-in slide-in-from-right-4">
                        <h3 className="font-semibold text-lg">Paso 3: Resumen y Confirmación</h3>
                        
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                            <div className="flex justify-between border-b border-slate-200 pb-3">
                                <div>
                                    <p className="text-sm text-slate-500">Cliente</p>
                                    <p className="font-bold text-slate-900">{clientes.find(c => c.id === watchClienteId)?.nombre}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-slate-500">Plan</p>
                                    <p className="font-bold text-indigo-700">{selectedPlan?.nombre}</p>
                                </div>
                            </div>

                            <div>
                                <h4 className="font-semibold text-slate-700 mb-2 text-sm uppercase tracking-wider">Desglose a Cobrar</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between text-slate-600">
                                        <span>Precio Base ({selectedPlan?.nombre}):</span>
                                        <span>${previewMontoBase.toFixed(2)}</span>
                                    </div>
                                    {previewDescuento > 0 && (
                                        <div className="flex justify-between text-emerald-600 font-medium">
                                            <span>Descuento ({selectedPromo?.nombre}):</span>
                                            <span>-${previewDescuento.toFixed(2)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between font-bold text-lg text-slate-900 pt-2 border-t border-slate-200 mt-2">
                                        <span>Total a pagar en caja:</span>
                                        <span>${previewMontoFinal.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex items-start gap-3 text-blue-800">
                            <CreditCard className="w-5 h-5 shrink-0 mt-0.5" />
                            <div className="text-sm">
                                <p className="font-bold">Pago Pendiente</p>
                                <p>Al confirmar, la membresía se creará en estado <strong>PENDIENTE DE PAGO</strong>. Podrás cobrarla inmediatamente desde la caja.</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Controles del footer */}
                <div className="flex justify-between pt-4 border-t">
                    <Button 
                        type="button" 
                        variant="ghost" 
                        onClick={() => step === 1 ? onOpenChange(false) : prevStep()}
                        disabled={isPending}
                    >
                        {step === 1 ? 'Cancelar' : (
                            <><ChevronLeft className="w-4 h-4 mr-2" /> Atrás</>
                        )}
                    </Button>
                    
                    {step < 3 ? (
                        <Button type="button" onClick={nextStep} disabled={!watchClienteId && step === 1}>
                            Siguiente <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                    ) : (
                        <Button type="submit" disabled={isPending} className="bg-indigo-600 hover:bg-indigo-700">
                            {isPending ? 'Procesando...' : 'Confirmar Venta'}
                        </Button>
                    )}
                </div>
            </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
