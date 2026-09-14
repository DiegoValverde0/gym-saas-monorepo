import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { apiPost, apiDelete } from '@/lib/api-client';

interface UseSoftDeleteOptions {
  queryKey: string[];
  endpoint: string; // e.g., 'sucursales' or 'roles'
  itemName?: string; // e.g., 'La sucursal'
}

export function useSoftDelete({ queryKey, endpoint, itemName = 'El registro' }: UseSoftDeleteOptions) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => apiPost(`/${endpoint}/${id}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ 
        title: 'Acción deshecha', 
        description: `${itemName} ha sido restaurado con éxito.`, 
        variant: 'success' 
      });
    },
    onError: (err: any) => {
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
      queryClient.invalidateQueries({ queryKey });
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
    onError: (err: any) => {
      toast({ 
        title: 'Error al eliminar', 
        description: err.message, 
        variant: 'destructive' 
      });
    }
  });

  return {
    deleteItem: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
}
