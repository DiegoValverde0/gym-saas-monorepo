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

// (El token ahora se gestiona vía HttpOnly cookies en el backend)

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

async function clearSessionAndRedirectToLogin() {
  if (typeof window === 'undefined') return;
  
  // Limpiar tenant de zustand persist
  localStorage.removeItem('gym_tenant_storage');
  
  // Llamar al endpoint para borrar la cookie HttpOnly
  try {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {
    // Ignorar errores en logout forzado
  }
  
  window.location.href = '/login';
}

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
    'x-tenant-id': getActiveTenantId() || 'all',
  };
  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Forzar envío de cookies
  options.credentials = 'include';

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

export function apiGet<T = unknown>(path: string, options?: RequestInit) {
  return request<T>(path, { ...options, method: 'GET' });
}

export function apiPost<T = unknown>(path: string, body?: unknown, options?: RequestInit) {
  return request<T>(path, { ...options, method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined });
}

export function apiPatch<T = unknown>(path: string, body?: unknown, options?: RequestInit) {
  return request<T>(path, { ...options, method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined });
}

export function apiPut<T = unknown>(path: string, body?: unknown, options?: RequestInit) {
  return request<T>(path, { ...options, method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined });
}

export function apiDelete<T = unknown>(path: string, options?: RequestInit) {
  return request<T>(path, { ...options, method: 'DELETE' });
}

// Algunos endpoints devuelven una lista paginada {data, total, page, limit}.
// Este helper normaliza la respuesta para asegurar que siempre haya un array de datos.
export function unwrapList<T = unknown>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object' && 'data' in payload && Array.isArray((payload as Record<string, unknown>).data)) {
    return (payload as Record<string, unknown>).data as T[];
  }
  return [];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// Devuelve el objeto paginado completo, garantizando una estructura segura.
export function unwrapPaginatedList<T = unknown>(payload: unknown): PaginatedResponse<T> {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const p = payload as Record<string, unknown>;
    return {
      data: Array.isArray(p.data) ? p.data as T[] : [],
      total: typeof p.total === 'number' ? p.total : 0,
      page: typeof p.page === 'number' ? p.page : 1,
      limit: typeof p.limit === 'number' ? p.limit : 10,
    };
  }
  // Si no es un objeto paginado, asumimos que todo es la primera página
  const data = Array.isArray(payload) ? payload as T[] : [];
  return {
    data,
    total: data.length,
    page: 1,
    limit: data.length || 10,
  };
}
