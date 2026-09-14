"use client";

import { useForm, UseFormReturn, Controller } from 'react-hook-form';
import { ReactNode, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { AlertCircle } from 'lucide-react';

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
  renderCustom?: (form: UseFormReturn<any>) => ReactNode;
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
  form?: UseFormReturn<any>;
  sections?: FormSection[];
  
  // Old API (Backward compatibility)
  isOpen?: boolean;
  onClose?: () => void;
  fields?: FieldConfig[];
  defaultValues?: any;
  
  title: string;
  description?: ReactNode;
  onSubmit: (values: any) => void;
  isPending?: boolean;
  submitLabel?: string;
  submitLabelPending?: string;
  maxWidthClass?: string;
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
}: GlobalFormModalProps & { form: UseFormReturn<any> }) {
  
  const actualOpen = open !== undefined ? open : (isOpen || false);
  const actualOnOpenChange = onOpenChange || ((val) => {
    if (!val && onClose) onClose();
  });
  
  const actualSections = sections || (fields ? [{ fields }] : []);

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
            className={inputClass}
            aria-invalid={hasError}
          />
        ) : field.type === 'select' ? (
          <Controller
            control={form.control}
            name={field.name}
            render={({ field: controllerField }) => (
              <Select onValueChange={controllerField.onChange} value={controllerField.value || undefined} disabled={field.disabled}>
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

  return (
    <Dialog open={actualOpen} onOpenChange={actualOnOpenChange}>
      <DialogContent className={`${maxWidthClass} max-h-[90vh] overflow-y-auto flex flex-col`}>
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Separator className="my-2 shrink-0" />
        
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 flex-1 overflow-y-auto pr-1">
          {actualSections.map((section, idx) => (
            <div key={idx} className="space-y-4">
              {(section.title || section.icon) && (
                <div className={idx > 0 ? "pt-2" : ""}>
                    <h4 className="text-sm font-semibold text-zinc-900 flex items-center gap-2 border-b pb-2">
                        {section.icon} {section.title}
                    </h4>
                    {section.description && <p className="text-sm text-zinc-500 mt-1">{section.description}</p>}
                </div>
              )}
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {section.fields.map(renderField)}
              </div>
            </div>
          ))}
          
          <DialogFooter className="mt-6 pt-4 border-t sticky bottom-0 bg-white/95 backdrop-blur-sm">
            <Button 
              type="submit" 
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white" 
              disabled={isPending}
            >
              {isPending ? submitLabelPending : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
