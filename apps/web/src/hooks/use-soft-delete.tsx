import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { apiPost, apiDelete } from '@/lib/api-client';

interface UseSoftDeleteOptions {
  queryKey: unknown[]; // key de la lista; su primer elemento es la entidad (ej. 'clientes')
  endpoint: string; // e.g., 'sucursales' or 'roles'
  modelName: string; // e.g., 'sucursal', 'rol'
  itemName?: string; // e.g., 'La sucursal'
}

export function useSoftDelete({ queryKey, endpoint, modelName, itemName = 'El registro' }: UseSoftDeleteOptions) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Se invalida por la raíz de la entidad (ej. ['clientes']) y no por la key
  // exacta: la key de la lista incluye `showDeleted`, así que invalidar solo
  // la vista actual dejaba la otra (lista normal o papelera) en caché con
  // datos viejos hasta que venciera el staleTime. Así también se refrescan
  // selects de otras pantallas que dependen de la misma entidad.
  const invalidarEntidad = () => queryClient.invalidateQueries({ queryKey: [queryKey[0]] });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => apiPost(`/sistema/restaurar`, { modelo: modelName, id }),
    onSuccess: () => {
      invalidarEntidad();
      toast({ 
        title: 'Acción deshecha', 
        description: `${itemName} ha sido restaurado con éxito.`, 
        variant: 'success' 
      });
    },
    onError: (err: Error) => {
      toast({ 
        title: 'Error al restaurar', 
        description: err.message, 
        variant: 'destructive' 
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiDelete(`/${endpoint}/${id}`);
      return { id };
    },
    onSuccess: (data) => {
      invalidarEntidad();
      toast({ 
        title: 'Eliminado', 
        description: `${itemName} ha sido eliminado. Tienes 5 segundos para deshacer.`, 
        variant: 'success',
        duration: 5000,
        action: (
          <Button 
            variant="outline" 
            size="sm" 
            className="border-white text-zinc-900 bg-white hover:bg-zinc-100" 
            onClick={() => restoreMutation.mutate(data.id)}
          >
            Deshacer
          </Button>
        )
      });
    },
    onError: (err: Error) => {
      toast({ 
        title: 'Error al eliminar', 
        description: err.message, 
        variant: 'destructive' 
      });
    }
  });

  return {
    deleteItem: deleteMutation.mutate,
    restoreItem: restoreMutation.mutate,
    isDeleting: deleteMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
}
