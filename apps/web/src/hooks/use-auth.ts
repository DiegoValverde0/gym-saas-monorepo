"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { apiGet, apiPost } from '@/lib/api-client';

export interface AuthUser {
  sub: string;
  correo?: string | null;
  email?: string | null;
  nombre?: string | null;
  organizacionId?: string | null;
  organizacionNombre?: string | null;
  sucursalId?: string | null;
  sucursalNombre?: string | null;
  rolNombre?: string | null;
  is_superadmin?: boolean;
}

interface UseAuthOptions {
  // false para páginas públicas (ej. login) que no deben redirigir.
  redirectIfUnauthenticated?: boolean;
}

/**
 * Punto único de verdad para la sesión del lado del cliente. El JWT vive
 * únicamente en la cookie HttpOnly `gym_token` (nunca en localStorage -- ver
 * Auditoria_Claude.md), así que este hook no puede leerlo/decodificarlo:
 * pide los datos del usuario a GET /auth/me, que el navegador autentica
 * solo con la cookie. react-query dedupea/cachea la llamada entre los
 * múltiples componentes que llaman useAuth() en la misma página.
 */
export function useAuth(options: UseAuthOptions = {}) {
  const { redirectIfUnauthenticated = true } = options;
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: user, isError, isFetched } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => apiGet<AuthUser>('/auth/me'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (isError && redirectIfUnauthenticated) router.push('/login');
  }, [isError, redirectIfUnauthenticated, router]);

  const logout = () => {
    queryClient.removeQueries({ queryKey: ['auth-me'] });
    useTenantStore.getState().setActiveTenantId(null);
    // Debe pegarle al backend: es el único que puede borrar la cookie
    // HttpOnly y revocar el token en Redis -- limpiar solo el lado cliente
    // dejaba la sesión viva hasta que expirara sola.
    apiPost('/auth/logout', {})
      .catch(() => {})
      .finally(() => {
        window.location.href = '/login';
      });
  };

  return {
    token: !!user,
    user: user ?? null,
    isSuperAdmin: !!user?.is_superadmin,
    isReady: isFetched,
    logout,
  };
}
