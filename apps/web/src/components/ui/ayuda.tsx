"use client";

import { useEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';

// Explicaciones de dos líneas de los conceptos del sistema (plan 12.3), con
// los términos del glosario único (12.1). Un solo lugar para todos los textos.
export const AYUDAS = {
  horario: 'El horario de trabajo es la semana tipo de la persona (ej. lunes a viernes de 8 a 16). Con él, el sistema arma solo sus jornadas de las próximas semanas.',
  jornada: 'Una jornada es un día concreto de trabajo de una persona, sacado de su horario. Ahí se marca la entrada, la salida o una ausencia.',
  clase: 'Una clase es algo que se repite cada semana (ej. Spinning martes y jueves a las 18:00). Cada fecha en el calendario es una sesión de esa clase.',
  sesion: 'Una sesión es una fecha concreta de una clase. Puedes cambiar solo esa sesión (hora, instructor, cancelarla) sin tocar la clase entera.',
  quienReserva: 'Quién puede reservar las clases de esta disciplina: cualquier cliente con membresía, solo ciertos planes o cualquiera, aunque no tenga membresía.',
  tolerancia: 'Minutos de gracia antes de mostrar a alguien del equipo como atrasado en Jornadas si todavía no marcó su entrada.',
  modo: 'El modo decide cuánto detalle muestra el sistema. Cambiarlo no borra nada: lo que ya configuraste se oculta o se vuelve a mostrar.',
  cierreDia: 'Al final del día cuentas el efectivo de la caja y el sistema lo compara con lo que debería haber según lo cobrado y lo gastado en efectivo.',
  sucursalActiva: 'La sucursal con la que estás trabajando. Las pantallas la usan por defecto para no volver a preguntarla.',
} as const;

/**
 * Ícono "?" junto a un concepto: muestra la explicación al pasar el mouse o
 * al tocarlo (también en el celular, donde no hay hover).
 */
export function Ayuda({ tema, className }: { tema: keyof typeof AYUDAS; className?: string }) {
  const [abierta, setAbierta] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!abierta) return;
    const cerrar = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierta(false);
    };
    document.addEventListener('mousedown', cerrar);
    document.addEventListener('touchstart', cerrar);
    return () => {
      document.removeEventListener('mousedown', cerrar);
      document.removeEventListener('touchstart', cerrar);
    };
  }, [abierta]);

  return (
    <span ref={ref} className={`relative inline-flex align-middle ${className ?? ''}`} onMouseEnter={() => setAbierta(true)} onMouseLeave={() => setAbierta(false)}>
      <button
        type="button"
        aria-label="¿Qué es esto?"
        aria-expanded={abierta}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAbierta((a) => !a); }}
        className="text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {abierta && (
        <span role="tooltip" className="absolute left-1/2 top-5 z-50 w-64 -translate-x-1/2 rounded-md bg-slate-900 dark:bg-slate-700 px-3 py-2 text-xs font-normal normal-case tracking-normal text-white shadow-lg">
          {AYUDAS[tema]}
        </span>
      )}
    </span>
  );
}
