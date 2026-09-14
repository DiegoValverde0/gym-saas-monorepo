"use client";

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPut } from '@/lib/api-client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const organizacionSchema = z.object({
  nombre: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
});

type OrganizacionFormValues = z.infer<typeof organizacionSchema>;

export default function ConfiguracionPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token } = useAuth();

  const { data: organizacion, isLoading } = useQuery({
    queryKey: ['organizacion'],
    // La ruta real es /organizaciones/me/info (ver organizacion.controller.ts);
    // antes esta página apuntaba a /organizacion (sin "es"), una ruta
    // inexistente -- este endpoint estaba roto, ahora funciona.
    queryFn: async () => apiGet('/organizaciones/me/info'),
    enabled: !!token,
  });

  const form = useForm<OrganizacionFormValues>({
    resolver: zodResolver(organizacionSchema),
    defaultValues: {
      nombre: '',
    },
  });

  useEffect(() => {
    if (organizacion) {
      form.reset({
        nombre: organizacion.nombre,
      });
    }
  }, [organizacion, form]);

  const updateMutation = useMutation({
    mutationFn: async (values: OrganizacionFormValues) => apiPut('/organizaciones/me/info', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizacion'] });
      toast({
        title: 'Organización actualizada',
        description: 'Los cambios se han guardado correctamente.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (values: OrganizacionFormValues) => {
    updateMutation.mutate(values);
  };

  if (!token) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Configuración</h2>
          <p className="text-zinc-500 mt-1">
            Administra los datos generales de tu organización
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="w-5 h-5 text-zinc-400" />
            Perfil de la Organización
          </CardTitle>
          <CardDescription>
            Estos datos serán visibles en tus facturas y comprobantes.
          </CardDescription>
        </CardHeader>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre de la Organización</Label>
              <Input
                id="nombre"
                placeholder={isLoading ? "Cargando..." : "Ej. Gym Manager Fitness"}
                {...form.register('nombre')}
                disabled={isLoading || updateMutation.isPending}
              />
              {form.formState.errors.nombre && (
                <p className="text-sm text-red-500">{form.formState.errors.nombre.message}</p>
              )}
            </div>
            
            {/* Aquí podrían ir más campos como RUC, Dirección Fiscal, etc. */}
            
          </CardContent>
          <CardFooter className="flex justify-end bg-zinc-50/50 rounded-b-xl">
            <Button 
              type="submit" 
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
              disabled={updateMutation.isPending || isLoading}
            >
              {updateMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
