"use client";

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';
import { useTenantStore } from '@/store/use-tenant-store';
import { apiGet, apiPost } from '@/lib/api-client';
import { enlaceWhatsapp } from '@/lib/whatsapp';
import { Bell, Check, MessageCircle, Smartphone } from 'lucide-react';

type TipoAviso = 'POR_VENCER' | 'VENCE_HOY' | 'VENCIDA' | 'LUGAR' | 'CANCELADA';

interface AvisoWhatsapp {
  clave: string;
  tipo: TipoAviso;
  clienteId: string;
  cliente: string;
  telefono: string | null;
  tienePortal: boolean;
  resumen: string;
  mensaje: string;
}

const COLOR: Record<TipoAviso, string> = {
  CANCELADA: 'bg-rose-500',
  LUGAR: 'bg-emerald-500',
  VENCE_HOY: 'bg-amber-500',
  POR_VENCER: 'bg-amber-400',
  VENCIDA: 'bg-slate-400',
};

/**
 * "Avisos para enviar" (docs/plan-avisos-automaticos.md, fase 3): los clientes
 * a los que conviene escribirles hoy, con el mensaje ya escrito. Enviar por
 * WhatsApp abre el chat y lo saca de la lista; "Quitar" es para cuando no
 * hace falta (o no tiene teléfono).
 */
export function AvisosParaEnviar() {
  const { token, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const puede = !!token && !isSuperAdmin && hasPermission('membresias:crear');

  const clave = ['avisos-whatsapp', activeTenantId];
  const { data: avisos } = useQuery({
    queryKey: clave,
    queryFn: () => apiGet<AvisoWhatsapp[]>('/avisos/whatsapp'),
    enabled: puede,
    refetchInterval: 5 * 60_000,
  });
  const { data: org } = useQuery({
    queryKey: ['organizacion'],
    queryFn: () => apiGet<{ moneda?: string }>('/organizaciones/me/info'),
    enabled: puede,
  });

  const hecho = useMutation({
    mutationFn: (a: AvisoWhatsapp) => apiPost(`/avisos/whatsapp/${encodeURIComponent(a.clave)}/hecho`, {}),
    // Sale de la lista en el acto; si falla, vuelve.
    onMutate: async (a) => {
      await queryClient.cancelQueries({ queryKey: clave });
      const antes = queryClient.getQueryData<AvisoWhatsapp[]>(clave);
      queryClient.setQueryData<AvisoWhatsapp[]>(clave, (lista) => lista?.filter((x) => x.clave !== a.clave));
      return { antes };
    },
    onError: (err: Error, _a, ctx) => {
      queryClient.setQueryData(clave, ctx?.antes);
      toast({ title: 'No se pudo', description: err.message, variant: 'destructive' });
    },
  });

  if (!puede) return null;
  const cantidad = avisos?.length ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={cantidad ? `Avisos para enviar (${cantidad})` : 'Avisos para enviar'}
        title="Avisos para enviar"
        className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <Bell className="h-5 w-5" />
        {cantidad > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {cantidad > 9 ? '9+' : cantidad}
          </span>
        )}
      </button>

      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent className="dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800">
          <SheetHeader className="dark:border-slate-800 dark:bg-slate-900">
            <SheetTitle className="text-base dark:text-white">Avisos para enviar</SheetTitle>
            <SheetDescription className="text-slate-500 dark:text-slate-400">
              Clientes a los que conviene escribirles hoy. El mensaje ya está escrito.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {cantidad === 0 ? (
              <div className="px-6 py-10 text-center">
                <Check className="mx-auto h-8 w-8 text-emerald-500" />
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No hay avisos pendientes.</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                  Aquí aparecen las membresías por vencer o vencidas, y los cambios en clases reservadas.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {avisos!.map((a) => (
                  <li key={a.clave} className="space-y-2 px-6 py-4">
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${COLOR[a.tipo] ?? 'bg-slate-400'}`} />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white">{a.cliente}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{a.resumen}</p>
                        {a.tienePortal && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                            <Smartphone className="h-3 w-3" /> También lo ve en su portal
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">{a.mensaje}</p>
                    <div className="flex items-center gap-2">
                      {a.telefono ? (
                        <a
                          href={enlaceWhatsapp(a.telefono, a.mensaje, org?.moneda)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => hecho.mutate(a)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> Enviar por WhatsApp
                        </a>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-400">Sin teléfono</span>
                      )}
                      <button
                        type="button"
                        onClick={() => hecho.mutate(a)}
                        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      >
                        Quitar de la lista
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
