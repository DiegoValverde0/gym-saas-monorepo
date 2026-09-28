"use client";

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useModoUso } from '@/hooks/use-modo-uso';
import { Lightbulb, X } from 'lucide-react';

// Busca el elemento que se resalta en un paso. Por texto o placeholder, así
// las pantallas no necesitan marcas especiales (salvo el Inicio).
const boton = (texto: string) => () =>
  [...document.querySelectorAll('button, a')].find((b) => b.textContent?.trim().toLowerCase().startsWith(texto.toLowerCase())) ?? null;
const buscador = (inicio: string) => () => document.querySelector(`input[placeholder^="${inicio}"]`);
const marca = (nombre: string) => () => document.querySelector(`[data-recorrido="${nombre}"]`);

interface Paso { titulo: string; texto: string; objetivo?: () => Element | null }

// Plan 12.3: en modo simple, al entrar por primera vez a cada pantalla, un
// recorrido de 3 pasos que se puede saltar.
const RECORRIDOS: Record<string, Paso[]> = {
  '/dashboard': [
    { titulo: 'Lo que pasa hoy', texto: 'Aquí ves cuánto cobraste hoy, cuántos clientes entraron y cómo va el mes.', objetivo: marca('resumen') },
    { titulo: 'Lo que más haces, a un toque', texto: 'Vender una membresía, registrar un ingreso, anotar un gasto y cerrar el día.', objetivo: marca('acciones') },
    { titulo: 'Quién está por vencer', texto: 'Los clientes cuya membresía vence esta semana. Con "Avisar" les escribes por WhatsApp.', objetivo: marca('por-vencer') },
  ],
  '/dashboard/clientes': [
    { titulo: 'Tus clientes', texto: 'Cada cliente con el estado de su membresía: activa, por vencer, vencida o sin membresía.' },
    { titulo: 'Encuéntralo rápido', texto: 'Busca por nombre, teléfono o documento. Tocando el nombre ves su ficha: membresía, ingresos y pagos.', objetivo: buscador('Buscar cliente') },
    { titulo: 'Registra uno nuevo', texto: 'Con nombre y teléfono alcanza. Los demás datos se completan después.', objetivo: boton('Nuevo Cliente') },
  ],
  '/dashboard/asistencias': [
    { titulo: 'La entrada del gimnasio', texto: 'Aquí registras quién entra. El sistema revisa solo si su membresía está al día.' },
    { titulo: 'Busca al cliente', texto: 'Escribe su nombre o documento. Verde: puede pasar. Rojo: te dice por qué y puedes venderle o renovarle ahí mismo.', objetivo: buscador('Buscar por nombre') },
    { titulo: 'Quién está adentro', texto: 'La lista de la derecha muestra quién entró hoy y quién sigue en el gimnasio.', objetivo: boton('Adentro') },
  ],
  '/dashboard/membresias': [
    { titulo: 'Las membresías vendidas', texto: 'Cada venta con su plan, lo que pagó y hasta cuándo vale.' },
    { titulo: 'Vender o renovar', texto: 'Elige el cliente, el plan y cómo paga. Queda activa al cobrar.', objetivo: boton('Nueva Venta') },
    { titulo: 'Buscar una venta', texto: 'Por el nombre del cliente o del plan.', objetivo: buscador('Buscar membresía') },
  ],
  '/dashboard/planes': [
    { titulo: 'Lo que vendes', texto: 'Un plan es lo que el cliente compra: mensual, trimestral, por sesiones o un pase de un día.' },
    { titulo: 'Crea un plan en segundos', texto: 'Elige una plantilla (por ejemplo "Mensual libre") y solo pon el precio.', objetivo: boton('Nuevo Plan') },
    { titulo: 'Cambiar precios', texto: 'Si cambias el precio de un plan, las membresías que ya vendiste no cambian.' },
  ],
  '/dashboard/productos': [
    { titulo: 'Lo que vendes en el mostrador', texto: 'Bebidas, suplementos, toallas: todo lo que no es una membresía.' },
    { titulo: 'Agrega un producto', texto: 'Con nombre y precio alcanza.', objetivo: boton('Nuevo Producto') },
    { titulo: 'Véndelo', texto: 'Con "Vender producto" lo cobras y queda en la caja del día.', objetivo: boton('Vender producto') },
  ],
  '/dashboard/clases': [
    { titulo: 'Tus clases', texto: 'Las clases de la semana, con cuántos lugares quedan en cada una.' },
    { titulo: 'Crea una clase', texto: 'El asistente te pregunta qué clase es, con quién y en qué días. Las fechas se generan solas.', objetivo: boton('Nueva clase') },
    { titulo: 'Reservas', texto: 'Toca una clase del calendario para ver quién reservó o anotar a alguien.' },
  ],
  '/dashboard/reportes': [
    { titulo: 'Cómo va el gimnasio', texto: 'Lo que cobraste hoy y en el mes, comparado con los mismos días del mes pasado.' },
    { titulo: 'Cómo te pagan', texto: 'Cuánto entró en efectivo, QR, tarjeta o transferencia.' },
    { titulo: 'Cerrar el día', texto: 'Desde el Inicio, "Cerrar el día" compara el efectivo que esperabas con el que contaste.' },
  ],
};

const clave = (usuario: string, ruta: string) => `gym_recorrido:${usuario}:${ruta}`;
const EVENTO_REINICIAR = 'gym-recorrido-reiniciar';

// Para "Volver a ver las guías" del menú de usuario.
export function reiniciarRecorridos(usuario: string) {
  try {
    Object.keys(RECORRIDOS).forEach((ruta) => localStorage.removeItem(clave(usuario, ruta)));
  } catch {
    // Sin localStorage (navegación privada): se vuelven a mostrar igual al recargar.
  }
  window.dispatchEvent(new Event(EVENTO_REINICIAR));
}

const CLASES_RESALTE = ['ring-4', 'ring-indigo-500', 'ring-offset-2', 'ring-offset-white', 'dark:ring-offset-slate-950', 'rounded-lg'];

export function Recorrido() {
  const ruta = usePathname();
  const { user } = useAuth({ redirectIfUnauthenticated: false });
  const { esSimple } = useModoUso();
  const pasos = RECORRIDOS[ruta];
  const [paso, setPaso] = useState<number | null>(null);

  const usuario = user?.sub;
  const mostrarSiNoVisto = useCallback(() => {
    if (!esSimple || !pasos || !usuario) return setPaso(null);
    let visto = false;
    try {
      visto = localStorage.getItem(clave(usuario, ruta)) === '1';
    } catch {
      visto = false;
    }
    setPaso(visto ? null : 0);
  }, [esSimple, pasos, usuario, ruta]);

  useEffect(() => {
    // Un momento después de entrar, cuando la pantalla ya dibujó lo que se resalta.
    const t = setTimeout(mostrarSiNoVisto, 800);
    window.addEventListener(EVENTO_REINICIAR, mostrarSiNoVisto);
    return () => {
      clearTimeout(t);
      window.removeEventListener(EVENTO_REINICIAR, mostrarSiNoVisto);
    };
  }, [mostrarSiNoVisto]);

  // Resalta el elemento del paso actual.
  useEffect(() => {
    if (paso === null || !pasos) return;
    const el = pasos[paso]?.objetivo?.();
    if (!el) return;
    el.classList.add(...CLASES_RESALTE);
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return () => el.classList.remove(...CLASES_RESALTE);
  }, [paso, pasos]);

  if (paso === null || !pasos || !usuario) return null;

  const terminar = () => {
    try {
      localStorage.setItem(clave(usuario, ruta), '1');
    } catch {
      // Sin localStorage se vuelve a mostrar la próxima vez: no es grave.
    }
    setPaso(null);
  };
  const actual = pasos[paso];
  const ultimo = paso === pasos.length - 1;

  return (
    <div
      role="dialog"
      aria-label={`Guía de la pantalla, paso ${paso + 1} de ${pasos.length}`}
      className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-indigo-200 dark:border-indigo-500/40 bg-white dark:bg-slate-900 p-4 shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96 animate-in fade-in slide-in-from-bottom-4"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-indigo-100 dark:bg-indigo-500/20 p-2 text-indigo-600 dark:text-indigo-300">
          <Lightbulb className="h-4 w-4" />
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Paso {paso + 1} de {pasos.length}</p>
          <p className="font-semibold text-slate-900 dark:text-white">{actual.titulo}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">{actual.texto}</p>
        </div>
        <button type="button" onClick={terminar} aria-label="Cerrar la guía" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <button type="button" onClick={terminar} className="text-sm text-slate-500 hover:underline dark:text-slate-400">
          Saltar
        </button>
        <div className="flex gap-2">
          {paso > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setPaso(paso - 1)}>
              Atrás
            </Button>
          )}
          <Button size="sm" onClick={() => (ultimo ? terminar() : setPaso(paso + 1))}>
            {ultimo ? 'Entendido' : 'Siguiente'}
          </Button>
        </div>
      </div>
    </div>
  );
}
