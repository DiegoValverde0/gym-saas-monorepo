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

/**
 * Pide un archivo (exportaciones de la reportería) y lo descarga en el
 * navegador con el nombre que manda la API. Los errores llegan en JSON.
 */
export async function apiDescargar(path: string, body?: unknown): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': getActiveTenantId() || 'all' },
    body: JSON.stringify(body ?? {}),
  }).catch(() => {
    throw new ApiError('No se pudo conectar con el servidor. Verifica tu conexión o que la API esté disponible.', 0);
  });
  if (res.status === 401) {
    clearSessionAndRedirectToLogin();
    throw new ApiError('Sesión expirada, inicia sesión de nuevo.', 401);
  }
  if (!res.ok) {
    const raw = await res.json().catch(() => null);
    const message = raw?.message ? (Array.isArray(raw.message) ? raw.message.join(', ') : raw.message) : `Error ${res.status}`;
    throw new ApiError(message, res.status);
  }
  const disposicion = res.headers.get('Content-Disposition') ?? '';
  const nombre = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(disposicion)?.[1] ?? /filename="([^"]+)"/.exec(disposicion)?.[1] ?? 'reporte');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
