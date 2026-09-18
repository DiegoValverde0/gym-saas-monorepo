import { useQuery } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { apiGet, unwrapList } from '@/lib/api-client';
import { useAuth } from './use-auth';

export function usePermissions() {
  const { activeTenantId } = useTenantStore();
  // No debe redirigir por sí mismo: se usa dentro de componentes (Protect,
  // command palette) que renderizan dentro de páginas cuyo propio useAuth()
  // ya se encarga de eso.
  const { token } = useAuth({ redirectIfUnauthenticated: false });

  const query = useQuery({
    queryKey: ['permissions', activeTenantId],
    queryFn: async () => unwrapList<string>(await apiGet('/auth/permisos')),
    enabled: token,
    // Solo deshabilitamos si no hay tenantId y no es 'all', pero en general
    // activeTenantId null al principio está bien (el backend manejará 'all' o null)
    staleTime: 5 * 60 * 1000, // 5 minutos de cache
  });

  const hasPermission = (permission: string) => {
    if (!query.data || !Array.isArray(query.data)) return false;
    // Si el backend nos retorna un wildcard o un permiso master, podríamos evaluarlo aquí
    // Por ahora verificamos coincidencia exacta
    return query.data.includes(permission);
  };

  return {
    ...query,
    hasPermission,
    permisos: query.data || [],
  };
}
