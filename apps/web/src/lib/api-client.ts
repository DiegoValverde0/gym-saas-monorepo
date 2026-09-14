// Cliente HTTP centralizado. Antes, cada página repetía fetch + headers +
// desenvolver el envelope {data: ...} del backend + su propio manejo de 401
// (ver Auditoria_Claude.md, Fase E). Este archivo es el único lugar que sabe
// cómo hablar con la API.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('gym_token');
}

// Lee el tenant activo directamente del storage de zustand (use-tenant-store)
// para no crear una dependencia circular entre el store y este cliente.
function getActiveTenantId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('gym_tenant_storage');
    if (!raw) return null;
    return JSON.parse(raw)?.state?.activeTenantId ?? null;
  } catch {
    return null;
  }
}

function clearSessionAndRedirectToLogin() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('gym_token');
  localStorage.removeItem('gym_tenant_storage');
  document.cookie = 'has_session=; path=/; max-age=0';
  window.location.href = '/login';
}

async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
    'x-tenant-id': getActiveTenantId() || 'all',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers }).catch(() => {
    throw new ApiError('No se pudo conectar con el servidor. Verifica tu conexión o que la API esté disponible.', 0);
  });

  const raw = await res.json().catch(() => null);
  // El ResponseInterceptor global del backend envuelve todo en {data: ...}.
  const payload = raw && typeof raw === 'object' && 'data' in raw ? raw.data : raw;

  // Un 401 en /auth/login significa credenciales inválidas, no una sesión
  // expirada: no hay sesión previa que limpiar ni redirección que hacer, solo
  // se debe mostrar el mensaje de error en el propio formulario de login.
  const isLoginRequest = path.startsWith('/auth/login');
  if (res.status === 401 && !isLoginRequest) {
    clearSessionAndRedirectToLogin();
    throw new ApiError('Sesión expirada, inicia sesión de nuevo.', 401);
  }

  if (!res.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message.join(', ')
          : payload.message
        : `Error ${res.status}`;
    throw new ApiError(message, res.status);
  }

  return payload as T;
}

export function apiGet<T = any>(path: string, options?: RequestInit) {
  return request<T>(path, { ...options, method: 'GET' });
}

export function apiPost<T = any>(path: string, body?: unknown, options?: RequestInit) {
  return request<T>(path, { ...options, method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined });
}

export function apiPatch<T = any>(path: string, body?: unknown, options?: RequestInit) {
  return request<T>(path, { ...options, method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined });
}

export function apiPut<T = any>(path: string, body?: unknown, options?: RequestInit) {
  return request<T>(path, { ...options, method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined });
}

export function apiDelete<T = any>(path: string, options?: RequestInit) {
  return request<T>(path, { ...options, method: 'DELETE' });
}

// Algunos endpoints (clientes, planes, promociones) devuelven una lista
// paginada {data, total, page, limit}; el resto devuelve el arreglo directo.
// Este helper normaliza ambos casos para el código de las páginas.
export function unwrapList<T = any>(payload: any): T[] {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}
