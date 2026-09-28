"use client";

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';
import { Catalogo, ReporteGuardado } from './tipos';

export const useCatalogo = () =>
  useQuery({ queryKey: ['reporteria-catalogo'], queryFn: () => apiGet<Catalogo>('/reporteria/tipos'), staleTime: 5 * 60_000 });

export const useReporte = (id: string) =>
  useQuery({ queryKey: ['reporteria-reporte', id], queryFn: () => apiGet<ReporteGuardado>(`/reporteria/reportes/${id}`) });

export const fechaCorta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
