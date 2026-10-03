"use client";

import { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiGet } from '@/lib/api-client';

// Modo de uso de la organización (plan de simplificación, sección 4): decide
// cuánto detalle muestra el sistema. Ocultar no borra nada: al pasar de
// Experto a Simple, todo lo configurado sigue ahí.
export type ModoUso = 'simple' | 'intermedio' | 'experto';

// Debe coincidir con MODO_USO_POR_DEFECTO del backend (modo.util.ts):
// intermedio, para que los gimnasios existentes no pierdan nada visible.
export const MODO_USO_POR_DEFECTO: ModoUso = 'intermedio';

const NIVEL: Record<ModoUso, number> = { simple: 0, intermedio: 1, experto: 2 };

export const MODOS_USO: { valor: ModoUso; nombre: string; paraQuien: string; idea: string }[] = [
  {
    valor: 'simple',
    nombre: 'Simple',
    paraQuien: 'Un solo local, pocas personas, primera vez con un sistema.',
    idea: 'Registras clientes, vendes membresías y controlas quién entra. Todo con valores por defecto.',
  },
  {
    valor: 'intermedio',
    nombre: 'Intermedio',
    paraQuien: 'Gimnasio establecido, con equipo y quizá 2 sucursales.',
    idea: 'Suma horarios del equipo, clases con reservas, gastos y reportes básicos.',
  },
  {
    valor: 'experto',
    nombre: 'Experto',
    paraQuien: 'Cadenas y gimnasios con administración formal.',
    idea: 'Todas las reglas y validaciones, roles a medida, arqueos, costos y auditoría.',
  },
];

interface OnboardingConfig {
  tipoGimnasio?: string;
  tamanoEquipo?: string;
  clasesGrupales?: boolean;
  completado?: boolean;
  primerosPasosOcultos?: boolean;
}

interface OrganizacionConConfig {
  configuracion?: { modoUso?: ModoUso; onboarding?: OnboardingConfig } | null;
}

export function useModoUso() {
  const { token, isSuperAdmin } = useAuth({ redirectIfUnauthenticated: false });
  const { data, isFetched } = useQuery({
    queryKey: ['organizacion'], // Mismo queryKey que use-modulos-activos.ts y configuracion/page.tsx
    queryFn: async () => apiGet<OrganizacionConConfig>('/organizaciones/me/info'),
    enabled: !!token && !isSuperAdmin,
  });

  const guardado = data?.configuracion?.modoUso;
  // El superadmin no tiene organización propia: ve todo, como en experto.
  const modo: ModoUso = isSuperAdmin ? 'experto' : guardado && guardado in NIVEL ? guardado : MODO_USO_POR_DEFECTO;

  return {
    modo,
    /** true si el modo actual es al menos `minimo` (simple < intermedio < experto). */
    alMenos: (minimo: ModoUso) => NIVEL[modo] >= NIVEL[minimo],
    esSimple: modo === 'simple',
    esExperto: modo === 'experto',
    onboarding: data?.configuracion?.onboarding ?? null,
    cargado: isFetched || isSuperAdmin,
  };
}

/** Muestra su contenido solo si el modo de uso es al menos `minimo`. */
export function SoloEnModo({ minimo, children }: { minimo: ModoUso; children: ReactNode }) {
  const { alMenos } = useModoUso();
  return alMenos(minimo) ? <>{children}</> : null;
}
