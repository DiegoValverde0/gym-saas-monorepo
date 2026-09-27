"use client";

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from './use-auth';
import { useDebounce } from './use-debounce';

const POR_PAGINA = 25;

type Filtros = Record<string, string | undefined>;

interface Opciones {
  /** Raíz de la queryKey (ej. 'clientes'): la que invalidan los formularios y useSoftDelete. */
  entidad: string;
  /** Ruta del listado en la API (ej. '/clientes'). */
  ruta: string;
  /** Texto del buscador; se envía como `search`, ya con espera entre teclas. */
  busqueda?: string;
  /** Otros parámetros de la API; los vacíos no se envían. */
  filtros?: Filtros;
  enabled?: boolean;
}

interface Respuesta<T> {
  data: T[];
  total: number;
  totalPaginas: number;
  [extra: string]: unknown;
}

/**
 * Listado paginado y buscado en el servidor. Antes cada pantalla pedía solo
 * la primera página (50 registros) y buscaba dentro de ella en el navegador:
 * el resto nunca aparecía. Al cambiar la búsqueda o un filtro vuelve a la
 * página 1.
 */
export function useListaPaginada<T>({ entidad, ruta, busqueda = '', filtros = {}, enabled = true }: Opciones) {
  const { token } = useAuth({ redirectIfUnauthenticated: false });
  const { activeTenantId } = useTenantStore();
  const termino = useDebounce(busqueda.trim(), 300);

  const parametros: Filtros = { ...filtros, search: termino || undefined };
  const clave = JSON.stringify(parametros);
  const [estado, setEstado] = useState({ clave, pagina: 1 });
  // Otra búsqueda o filtro: página 1 (también al volver al filtro anterior).
  if (estado.clave !== clave) setEstado({ clave, pagina: 1 });
  const pagina = estado.clave === clave ? estado.pagina : 1;
  const setPagina = (p: number) => setEstado({ clave, pagina: p });

  const query = useQuery({
    queryKey: [entidad, activeTenantId, 'lista', ruta, parametros, pagina],
    queryFn: async (): Promise<Respuesta<T>> => {
      const qs = new URLSearchParams({ page: String(pagina), limit: String(POR_PAGINA) });
      Object.entries(parametros).forEach(([k, v]) => { if (v) qs.set(k, v); });
      const r = await apiGet<Respuesta<T>>(`${ruta}?${qs}`);
      return {
        ...r,
        data: Array.isArray(r?.data) ? r.data : [],
        total: r?.total ?? 0,
        totalPaginas: r?.totalPaginas ?? 1,
      };
    },
    enabled: !!token && enabled,
    // Mientras llega la página siguiente se sigue viendo la actual.
    placeholderData: (previo) => previo,
  });

  const totalPaginas = Math.max(1, query.data?.totalPaginas ?? 1);
  // Si se borró lo último de la última página, volver a la anterior.
  useEffect(() => {
    if (query.data && pagina > totalPaginas) setEstado({ clave, pagina: totalPaginas });
  }, [query.data, pagina, totalPaginas, clave]);

  return {
    items: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    pagina,
    porPagina: POR_PAGINA,
    totalPaginas,
    setPagina,
    /** Respuesta completa, para datos extra del servidor (ej. `bajoStock`). */
    respuesta: query.data,
    cargando: query.isLoading,
    actualizando: query.isFetching,
    /** Hay búsqueda activa (ya enviada al servidor). */
    buscando: !!termino,
  };
}
