import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiGet } from '@/lib/api-client';

export interface ModulosConfig {
  puntoVenta: boolean;
  clasesGrupales: boolean;
  controlPersonal: boolean;
  reportesAvanzados: boolean;
}

// Deben coincidir con los defaults del backend (ver modulo-activo.guard.ts).
const MODULOS_POR_DEFECTO: ModulosConfig = {
  puntoVenta: true,
  clasesGrupales: false,
  controlPersonal: false,
  reportesAvanzados: true,
};

// Antes esta lógica vivía duplicada solo en dashboard/layout.tsx, así que el
// Command Palette (Cmd+K) mostraba "Clases", "Personal", etc. aunque el
// tenant los tuviera desactivados en Configuración → Módulos.
export function useModulosActivos(): ModulosConfig {
  const { token, isSuperAdmin } = useAuth();

  const { data: miOrganizacion } = useQuery({
    queryKey: ['organizacion'], // Mismo queryKey que configuracion/page.tsx y layout.tsx
    queryFn: async () => apiGet('/organizaciones/me/info'),
    enabled: !!token && !isSuperAdmin,
  });

  const configuracion = miOrganizacion as { configuracion?: { modulos?: Partial<ModulosConfig> } } | undefined;
  return { ...MODULOS_POR_DEFECTO, ...configuracion?.configuracion?.modulos };
}
