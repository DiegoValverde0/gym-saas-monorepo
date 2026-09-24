"use client";

import { useForm, UseFormReturn, Controller, FieldValues, DefaultValues } from 'react-hook-form';
import { ReactNode, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';

export type FieldType = 'text' | 'email' | 'password' | 'number' | 'select' | 'switch' | 'custom';

export interface FieldOption {
  value: string;
  label: string;
  className?: string;
}

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: FieldOption[];
  description?: string;
  disabled?: boolean;
  colSpan?: 1 | 2;
  allowDecimals?: boolean; // solo aplica a type: 'number' (ver NumberInput)
  renderCustom?: (form: UseFormReturn<FieldValues>) => ReactNode;
}

export interface FormSection {
  title?: string;
  description?: string;
  icon?: ReactNode;
  fields: FieldConfig[];
}

export interface GlobalFormModalProps {
  // New API
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  form?: UseFormReturn<FieldValues>;
  sections?: FormSection[];
  
  // Old API (Backward compatibility)
  isOpen?: boolean;
  onClose?: () => void;
  fields?: FieldConfig[];
  defaultValues?: DefaultValues<FieldValues>;
  
  title: string;
  description?: ReactNode;
  onSubmit: (values: FieldValues) => void;
  isPending?: boolean;
  submitLabel?: string;
  submitLabelPending?: string;
  maxWidthClass?: string;
  // Cuando hay 2+ `sections` con `title`, las pagina como pasos (estilo
  // "vender membresía": puntos de progreso arriba, Atrás/Siguiente abajo,
  // valida solo los campos del paso actual antes de avanzar) en vez de
  // apilarlas todas en un solo scroll. Pensado para formularios con muchos
  // campos ya agrupados en secciones con nombre -- ver membresia-wizard-modal.tsx,
  // el origen de este patrón.
  multiStep?: boolean;
}

export function GlobalFormModal(props: GlobalFormModalProps) {
  if (props.form) {
    return <GlobalFormModalInner {...props} form={props.form} />;
  }
  return <GlobalFormModalWrapper {...props} />;
}

function GlobalFormModalWrapper(props: GlobalFormModalProps) {
  const form = useForm({ defaultValues: props.defaultValues || {} });
  
  useEffect(() => {
    if (props.isOpen || props.open) {
      form.reset(props.defaultValues || {});
    }
  }, [props.isOpen, props.open, props.defaultValues, form]);

  return <GlobalFormModalInner {...props} form={form} />;
}

function GlobalFormModalInner({
  open,
  onOpenChange,
  isOpen,
  onClose,
  title,
  description,
  form,
  sections,
  fields,
  onSubmit,
  isPending,
  submitLabel = 'Guardar',
  submitLabelPending = 'Guardando...',
  maxWidthClass = 'sm:max-w-[500px]',
  multiStep,
}: GlobalFormModalProps & { form: UseFormReturn<FieldValues> }) {

  const actualOpen = open !== undefined ? open : (isOpen || false);
  const actualOnOpenChange = onOpenChange || ((val) => {
    if (!val && onClose) onClose();
  });

  const actualSections = sections || (fields ? [{ fields }] : []);
  const isPaginated = !!multiStep && actualSections.length > 1;
  const totalSteps = actualSections.length;

  const [step, setStep] = useState(0);
  useEffect(() => {
    if (actualOpen) setStep(0);
  }, [actualOpen]);
  const isLastStep = !isPaginated || step === totalSteps - 1;

  const goNext = async () => {
    const fieldNames = actualSections[step]?.fields.map((f) => f.name) ?? [];
    const valid = await form.trigger(fieldNames as never);
    if (valid) setStep((s) => Math.min(s + 1, totalSteps - 1));
  };
  const goPrev = () => setStep((s) => Math.max(s - 1, 0));

  const renderField = (field: FieldConfig) => {
    if (field.type === 'custom' && field.renderCustom) {
      return (
        <div key={field.name} className={`space-y-2 ${field.colSpan === 2 ? 'sm:col-span-2' : ''}`}>
           {field.renderCustom(form)}
        </div>
      );
    }

    const hasError = !!form.formState.errors[field.name];
    const baseInputClass = "transition-all duration-200";
    const normalInputClass = "border-zinc-300 focus-visible:ring-indigo-500 bg-white";
    const errorInputClass = "border-red-500 focus-visible:ring-red-500 bg-red-50 text-red-900";
    const inputClass = `${baseInputClass} ${hasError ? errorInputClass : normalInputClass}`;

    return (
      <div key={field.name} className={`space-y-2 ${field.colSpan === 2 ? 'sm:col-span-2' : ''}`}>
        {field.type !== 'switch' && (
           <Label htmlFor={field.name} className={`font-medium ${hasError ? 'text-red-600' : 'text-zinc-700'}`}>
             {field.label}
           </Label>
        )}
        
        {field.type === 'text' || field.type === 'email' || field.type === 'password' ? (
          <Input
            id={field.name}
            type={field.type}
            {...form.register(field.name)}
            placeholder={field.placeholder}
            disabled={field.disabled}
            className={inputClass}
            aria-invalid={hasError}
          />
        ) : field.type === 'number' ? (
          <NumberInput
            id={field.name}
            {...form.register(field.name)}
            placeholder={field.placeholder}
            disabled={field.disabled}
            allowDecimals={field.allowDecimals}
            className={inputClass}
            aria-invalid={hasError}
          />
        ) : field.type === 'select' ? (
          <Controller
            control={form.control}
            name={field.name}
            render={({ field: controllerField }) => (
              <Select
                // @base-ui/react's Select decide si es controlado o no en el
                // PRIMER render según si `value` es `undefined` -- pasar
                // `controllerField.value || undefined` con un valor inicial
                // '' lo deja no-controlado al montar, y en cuanto el usuario
                // elige algo (value deja de ser '') "salta" a controlado a
                // mitad de vida, algo que React no soporta (warning:
                // "changing the uncontrolled value state ... to be
                // controlled"). Con '' en vez de undefined queda controlado
                // desde el primer render siempre. También se ignora el
                // `null` que el Select puede emitir en onValueChange al
                // perder el foco sin una selección real (ver su tipo:
                // Value | null), para no pisar la selección ya hecha.
                onValueChange={(value) => {
                  if (value !== null) controllerField.onChange(value);
                }}
                value={controllerField.value ?? ''}
                disabled={field.disabled}
              >
                <SelectTrigger className={`w-full ${inputClass}`}>
                  <SelectValue placeholder={field.placeholder || "Selecciona una opción"}>
                    {controllerField.value
                      ? field.options?.find(opt => String(opt.value) === String(controllerField.value))?.label || "Cargando..."
                      : undefined
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {field.options?.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className={opt.className}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        ) : field.type === 'switch' ? (
          <div className={`flex items-center space-x-3 rounded-lg border p-4 transition-all duration-200 ${hasError ? 'border-red-300 bg-red-50' : 'border-zinc-200 bg-zinc-50'}`}>
            <Controller
              control={form.control}
              name={field.name}
              render={({ field: controllerField }) => (
                <Switch
                  checked={controllerField.value}
                  onCheckedChange={controllerField.onChange}
                  id={field.name}
                  disabled={field.disabled}
                  className="data-[state=checked]:bg-indigo-600"
                />
              )}
            />
            <div className="space-y-0.5">
              <Label htmlFor={field.name} className={`text-base cursor-pointer ${hasError ? 'text-red-700' : 'text-zinc-900'}`}>{field.label}</Label>
              {field.description && <p className={`text-sm ${hasError ? 'text-red-500' : 'text-zinc-500'}`}>{field.description}</p>}
            </div>
          </div>
        ) : null}

        {hasError && (
          <p className="text-sm font-medium text-red-500 flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
            <AlertCircle className="w-4 h-4" />
            {form.formState.errors[field.name]?.message as string}
          </p>
        )}
        
        {field.description && field.type !== 'switch' && (
            <p className="text-xs text-zinc-500">{field.description}</p>
        )}
      </div>
    );
  };

  const visibleSections = isPaginated ? actualSections.slice(step, step + 1) : actualSections;

  return (
    <Dialog open={actualOpen} onOpenChange={actualOnOpenChange}>
      <DialogContent className={`${maxWidthClass} max-h-[90vh] p-0 overflow-hidden flex flex-col`}>
        <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
          <div>
            <DialogTitle className="text-xl">{title}</DialogTitle>
            {description && <DialogDescription className="mt-1">{description}</DialogDescription>}
          </div>
          {isPaginated && (
            <div className="flex gap-2 shrink-0 pl-4">
              {actualSections.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-3 h-3 rounded-full transition-colors ${step >= idx ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                />
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={form.handleSubmit((v) => !isPending && onSubmit(v))}
          // Mismo fix que membresia-wizard-modal.tsx: en un formulario paginado,
          // Enter en el único input de texto de un paso intermedio puede
          // disparar el envío implícito nativo del navegador y saltarse los
          // pasos siguientes (incluida la revisión final). Solo se deja sin
          // pasar por acá el envío que dispara el propio botón "Guardar" del
          // último paso.
          onKeyDown={(e) => {
            if (isPaginated && e.key === 'Enter' && !isLastStep) {
              e.preventDefault();
            }
          }}
          className="flex-1 overflow-y-auto p-6 space-y-6"
        >
          {visibleSections.map((section, idx) => (
            <div key={section.title || idx} className={`space-y-4 ${isPaginated ? 'animate-in slide-in-from-right-4' : ''}`}>
              {(section.title || section.icon) && (
                <div className={!isPaginated && idx > 0 ? "pt-2" : ""}>
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2">
                        {section.icon} {isPaginated ? `Paso ${step + 1}: ${section.title}` : section.title}
                    </h4>
                    {section.description && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{section.description}</p>}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {section.fields.map(renderField)}
              </div>
            </div>
          ))}

          <div className="flex justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <Button
              type="button"
              variant="ghost"
              onClick={() => (isPaginated && step > 0 ? goPrev() : actualOnOpenChange(false))}
              disabled={isPending}
            >
              {isPaginated && step > 0 ? (
                <><ChevronLeft className="w-4 h-4 mr-2" /> Atrás</>
              ) : 'Cancelar'}
            </Button>

            {/* `key` distinto en cada botón: sin él React reutiliza el mismo
                <button> y solo cambia su `type`. Al pulsar "Siguiente" en el
                penúltimo paso, el paso avanza antes de que el navegador
                ejecute la acción por defecto del clic, que para entonces ve un
                type="submit" y envía (y cierra) el formulario. */}
            {isLastStep ? (
              <Button
                key="submit"
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 text-white"
                disabled={isPending}
              >
                {isPending ? submitLabelPending : submitLabel}
              </Button>
            ) : (
              <Button key="next" type="button" onClick={goNext}>
                Siguiente <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
