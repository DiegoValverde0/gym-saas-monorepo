"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenantStore } from '@/store/use-tenant-store';

export interface AuthUser {
  sub: string;
  correo?: string;
  email?: string;
  nombre?: string;
  organizacionId?: string | null;
  organizacionNombre?: string | null;
  sucursalId?: string | null;
  sucursalNombre?: string | null;
  rolNombre?: string | null;
  is_superadmin?: boolean;
}

// Única implementación de decodificación de JWT del frontend -- antes había
// varias copias, algunas sin decodeURIComponent (rompían con tildes/ñ en
// nombre/organización). Ver Auditoria_Claude.md, Fase E2.
export function decodeJwt(token: string): AuthUser | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

interface UseAuthOptions {
  // false para páginas públicas (ej. login) que no deben redirigir.
  redirectIfUnauthenticated?: boolean;
}

/**
 * Punto único de verdad para la sesión del lado del cliente: lee el token,
 * lo decodifica, expone el usuario y centraliza logout() (que ahora sí
 * limpia también el tenant activo, no solo el token).
 */
export function useAuth(options: UseAuthOptions = {}) {
  const { redirectIfUnauthenticated = true } = options;
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('gym_token');
    if (!stored) {
      if (redirectIfUnauthenticated) router.push('/login');
      setIsReady(true);
      return;
    }
    setToken(stored);
    setUser(decodeJwt(stored));
    setIsReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = () => {
    localStorage.removeItem('gym_token');
    localStorage.removeItem('gym_tenant_storage');
    document.cookie = 'has_session=; path=/; max-age=0';
    useTenantStore.getState().setActiveTenantId(null);
    window.location.href = '/login';
  };

  return {
    token,
    user,
    isSuperAdmin: !!user?.is_superadmin,
    isReady,
    logout,
  };
}
