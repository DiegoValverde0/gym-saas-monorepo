"use client";

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiDelete, apiPost } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { Copy, KeyRound, Smartphone, UserX } from 'lucide-react';

export interface EstadoAccesoPortal {
  correo: string;
  ultimaActividad: string | null;
}

interface Props {
  clienteId: string;
  nombre: string;
  correoFicha: string | null;
  acceso: EstadoAccesoPortal | null;
}

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

/**
 * Tarjeta "Portal del cliente" de la ficha (docs/plan-portal-cliente.md, fase 2):
 * dar acceso con el correo de la ficha, darle una contraseña nueva o quitarle
 * el acceso. Todo dentro de la tarjeta, sin ventanas encima de la ficha: la
 * contraseña temporal se muestra acá una sola vez, para copiarla o mandarla
 * por WhatsApp.
 */
export function AccesoPortal({ clienteId, nombre, correoFicha, acceso }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [correo, setCorreo] = useState(correoFicha ?? '');
  const [entregada, setEntregada] = useState<{ correo: string; contrasena: string | null } | null>(null);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['ficha-cliente', clienteId] });
  const alFallar = (err: Error) => toast({ title: 'No se pudo', description: err.message, variant: 'destructive' });

  const darAcceso = useMutation({
    mutationFn: async () => apiPost<{ correo: string; contrasenaTemporal: string | null }>(`/clientes/${clienteId}/portal`, { correo: correo.trim() }),
    onSuccess: (res) => {
      setEntregada({ correo: res.correo, contrasena: res.contrasenaTemporal });
      refrescar();
    },
    onError: alFallar,
  });
  const nuevaContrasena = useMutation({
    mutationFn: async () => apiPost<{ contrasenaTemporal: string }>(`/clientes/${clienteId}/portal/contrasena`, {}),
    onSuccess: (res) => setEntregada({ correo: acceso?.correo ?? '', contrasena: res.contrasenaTemporal }),
    onError: alFallar,
  });
  const quitar = useMutation({
    mutationFn: async () => apiDelete(`/clientes/${clienteId}/portal`),
    onSuccess: () => {
      setConfirmarQuitar(false);
      setEntregada(null);
      toast({ title: 'Acceso quitado', description: `${nombre} ya no puede entrar al portal.`, variant: 'success' });
      refrescar();
    },
    onError: alFallar,
  });

  const mensajeWhatsApp = (e: { correo: string; contrasena: string | null }) =>
    `Hola ${nombre.split(' ')[0]}, ya puedes ver tu membresía y reservar clases desde el celular: ${window.location.origin}/login\n` +
    `Correo: ${e.correo}` +
    (e.contrasena ? `\nContraseña temporal: ${e.contrasena} (cámbiala al entrar, en "Cuenta").` : '\nEntra con la contraseña que ya usas.');

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
        <Smartphone className="h-4 w-4" /> Portal del cliente
      </h4>

      {entregada ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {entregada.contrasena
              ? `Envíale estos datos a ${nombre}. La contraseña no se vuelve a mostrar: cópiala ahora.`
              : `Ese correo ya tenía cuenta en otro gimnasio: ${nombre} entra con su contraseña de siempre.`}
          </p>
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm dark:bg-slate-900">
            <p className="text-slate-500 dark:text-slate-400">Correo: <span className="text-slate-900 dark:text-white">{entregada.correo}</span></p>
            {entregada.contrasena && (
              <p className="mt-1 font-mono text-xl tracking-wider text-slate-900 select-all dark:text-white">{entregada.contrasena}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(mensajeWhatsApp(entregada))}`, '_blank', 'noopener')}>
              Enviar por WhatsApp
            </Button>
            {entregada.contrasena && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard?.writeText(entregada.contrasena ?? '').catch(() => {});
                  toast({ title: 'Copiada', variant: 'success' });
                }}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEntregada(null)}>
              Listo
            </Button>
          </div>
        </div>
      ) : acceso ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Entra con <span className="font-medium text-slate-900 dark:text-white">{acceso.correo}</span>.{' '}
            {acceso.ultimaActividad ? `Lo usó por última vez el ${fechaCorta(acceso.ultimaActividad)}.` : 'Todavía no entró.'}
          </p>
          {confirmarQuitar ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-700 dark:text-slate-200">¿Quitarle el acceso? Se cierra su sesión.</span>
              <Button size="sm" variant="destructive" disabled={quitar.isPending} onClick={() => quitar.mutate()}>
                Sí, quitar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmarQuitar(false)}>
                No
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={nuevaContrasena.isPending} onClick={() => nuevaContrasena.mutate()}>
                <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Olvidó su contraseña
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmarQuitar(true)}>
                <UserX className="mr-1.5 h-3.5 w-3.5" /> Quitar acceso
              </Button>
            </div>
          )}
        </div>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            darAcceso.mutate();
          }}
        >
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Desde su celular podrá ver su membresía y sus asistencias, y reservar clases.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input type="email" placeholder="Correo del cliente" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
            <Button type="submit" size="sm" className="shrink-0 sm:h-10" disabled={darAcceso.isPending || !correo.trim()}>
              {darAcceso.isPending ? 'Creando…' : 'Dar acceso'}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
