"use client";

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useTenantStore } from '@/store/use-tenant-store';
import { apiGet, unwrapList } from '@/lib/api-client';
import { useAuth } from './use-auth';

export interface SucursalBasica {
  id: string;
  nombre: string;
  esPrincipal?: boolean;
  estado?: string;
}

// Sucursal elegida en la barra superior, recordada en este navegador por
// organización (una misma persona puede trabajar en varios gimnasios).
interface SucursalElegidaState {
  elegidaPorOrg: Record<string, string>;
  elegir: (organizacionId: string, sucursalId: string) => void;
}

const useSucursalElegidaStore = create<SucursalElegidaState>()(
  persist(
    (set) => ({
      elegidaPorOrg: {},
      elegir: (organizacionId, sucursalId) =>
        set((s) => ({ elegidaPorOrg: { ...s.elegidaPorOrg, [organizacionId]: sucursalId } })),
    }),
    { name: 'gym_sucursal_activa' },
  ),
);

// Antes Control de acceso y Agenda guardaban cada uno su propia elección.
const CLAVES_ANTIGUAS = ['asistencias.sucursalId', 'agenda.sucursalId'];

/**
 * Sucursal con la que trabaja la sesión (plan de simplificación, sección 5):
 *  - Acceso limitado a una sucursal: esa, fija y sin selector.
 *  - Acceso a todas: la elegida en la barra superior (recordada en el
 *    navegador) o, si no eligió ninguna, la sede principal.
 *  - Una sola sucursal: esa, sin selector.
 * Todas las pantallas la usan como valor por defecto, para no volver a
 * preguntar lo que ya se eligió arriba.
 */
export function useSucursalActiva() {
  const { user, token } = useAuth({ redirectIfUnauthenticated: false });
  const { activeTenantId } = useTenantStore();
  const organizacionId = (user?.is_superadmin ? activeTenantId : user?.organizacionId) ?? null;
  const elegidaPorOrg = useSucursalElegidaStore((s) => s.elegidaPorOrg);
  const elegir = useSucursalElegidaStore((s) => s.elegir);

  const { data, isLoading } = useQuery({
    // Misma clave que usan las pantallas para la lista de sucursales.
    queryKey: ['sucursales', activeTenantId],
    queryFn: async () => unwrapList<SucursalBasica>(await apiGet('/sucursales')),
    enabled: token && !!organizacionId,
  });

  const sucursales = useMemo(() => (data || []).filter((s) => !s.estado || s.estado === 'ACTIVO'), [data]);
  const sucursalFija = user?.sucursalId ?? null;

  const sucursalId = useMemo(() => {
    if (sucursalFija) return sucursalFija;
    if (sucursales.length === 0) return null;
    let elegida = organizacionId ? elegidaPorOrg[organizacionId] : undefined;
    if (!elegida) {
      try {
        elegida = CLAVES_ANTIGUAS.map((k) => localStorage.getItem(k)).find((v) => v && sucursales.some((s) => s.id === v)) ?? undefined;
      } catch { /* sin almacenamiento */ }
    }
    if (elegida && sucursales.some((s) => s.id === elegida)) return elegida;
    return (sucursales.find((s) => s.esPrincipal) ?? sucursales[0]).id;
  }, [sucursalFija, sucursales, organizacionId, elegidaPorOrg]);

  // Se fija la elección migrada de las claves antiguas para no depender más de ellas.
  useEffect(() => {
    if (organizacionId && sucursalId && !sucursalFija && !elegidaPorOrg[organizacionId]) elegir(organizacionId, sucursalId);
  }, [organizacionId, sucursalId, sucursalFija, elegidaPorOrg, elegir]);

  const sucursal = sucursales.find((s) => s.id === sucursalId) ?? (sucursalFija ? { id: sucursalFija, nombre: user?.sucursalNombre ?? 'Mi sucursal' } : null);

  return {
    sucursalId,
    sucursal,
    sucursales,
    /** true si la persona está limitada a una sucursal (no puede cambiarla). */
    esFija: !!sucursalFija,
    /** true si tiene sentido mostrar un selector: acceso a todas y más de una sucursal. */
    puedeElegir: !sucursalFija && sucursales.length > 1,
    /** true si la organización tiene más de una sucursal (para mostrar u ocultar columnas). */
    variasSucursales: sucursales.length > 1,
    cargando: isLoading,
    cambiar: (id: string) => {
      if (organizacionId && !sucursalFija) elegir(organizacionId, id);
    },
  };
}
